import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  arrayRemove,
  arrayUnion,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import ScreenWrapper from '../../components/ScreenWrapper';
import SkeletonCard from '../../components/SkeletonLoader';
import { useToast } from '../../components/Toast';
import OnboardingSlider from '../../components/OnboardingSlider';
import GlassCard from '../../components/GlassCard';
import CategoryPillRow from '../../components/CategoryPill';
import QuorumProgressBar from '../../components/QuorumProgressBar';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

const FILTER_PILLS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Archived', value: 'archived' },
];

const ONBOARDING_STEPS = [
  { step: '1', title: 'Create a plan', desc: 'Pick an activity, set a date and location' },
  { step: '2', title: 'Invite friends', desc: 'Add friends and share the plan with them' },
  { step: '3', title: 'Reach quorum', desc: 'Once enough people vote, the plan is confirmed' },
] as const;

const SKELETON_KEYS = ['s1', 's2', 's3'];

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'archived';

type Plan = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  votes: string[];
  requiredVotes: number;
  createdBy: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  archivedBy?: string[];
  coverUrl?: string;
  category?: string;
  dateTimestamp?: string;
  pinnedBy?: string[];
  voteDeadline?: string;
  maxParticipants?: number;
  participants?: string[];
};

type FriendPlan = {
  id: string;
  title: string;
  friendName: string;
  status: string;
  category?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getCountdown = (dateTimestamp?: string): string | null => {
  if (!dateTimestamp) return null;
  const time = new Date(dateTimestamp).getTime();
  if (Number.isNaN(time)) return null;
  const diff = time - Date.now();
  if (diff < 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `In ${days} days`;
  return null;
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const quorumPercent = (plan: Plan): number => {
  const votes = plan.votes?.length || 0;
  const required = Math.max(plan.requiredVotes || 3, 1);
  return Math.round(Math.min(votes / required, 1) * 100);
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [uid, setUid] = useState(auth.currentUser?.uid || '');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [friendPlans, setFriendPlans] = useState<FriendPlan[]>([]);
  const [contextPlan, setContextPlan] = useState<Plan | null>(null);
  const [displayName, setDisplayName] = useState(
    auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || ''
  );

  const contextSheetY = useRef(new Animated.Value(300)).current;
  const [photoURL, setPhotoURL] = useState<string | null>(
    auth.currentUser?.photoURL || null
  );

  // ---- Auth (single listener feeds uid + display name + avatar) ----
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUid(u?.uid || '');
      setDisplayName(u?.displayName || u?.email?.split('@')[0] || '');
      setPhotoURL(u?.photoURL || null);
    });
  }, []);

  // ---- Onboarding check ----
  useEffect(() => {
    if (!uid) return;
    let active = true;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (active && snap.exists() && !snap.data()?.onboardingDone) {
          setShowOnboarding(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [uid]);

  const handleOnboardingDone = useCallback(async () => {
    setShowOnboarding(false);
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'users', uid), { onboardingDone: true });
    } catch {
      /* non-fatal */
    }
  }, [uid]);

  // ---- Friends' plans ----
  useEffect(() => {
    if (!uid) {
      setFriendPlans([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const friendIds: string[] = snap.data()?.friends || [];
        if (friendIds.length === 0) {
          if (active) setFriendPlans([]);
          return;
        }
        const friendDocs = await Promise.all(
          friendIds.slice(0, 10).map((fid) => getDoc(doc(db, 'users', fid)))
        );
        const nameMap: Record<string, string> = {};
        friendDocs.forEach((d) => {
          if (d.exists()) {
            nameMap[d.id] = d.data()?.displayName || d.data()?.username || 'Friend';
          }
        });
        const friendPlanSnap = await getDocs(
          query(
            collection(db, 'plans'),
            where('isPublic', '==', true),
            orderBy('createdAt', 'desc'),
            limit(30)
          )
        );
        const results: FriendPlan[] = [];
        friendPlanSnap.docs.forEach((d) => {
          const data = d.data();
          const participants: string[] = data.participants || [];
          if (participants.includes(uid)) return;
          const friendMatch = friendIds.find((fid) => participants.includes(fid));
          if (friendMatch) {
            results.push({
              id: d.id,
              title: data.title,
              friendName: nameMap[friendMatch] || 'Friend',
              status: data.status,
              category: data.category,
            });
          }
        });
        if (active) setFriendPlans(results.slice(0, 8));
      } catch {
        if (active) setFriendPlans([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [uid]);

  // ---- My plans subscription (re-subscribes when uid resolves) ----
  useEffect(() => {
    if (!uid) {
      setPlans([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'plans'),
      where('participants', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Plan)));
        setLoading(false);
        setRefreshing(false);
      },
      () => {
        setLoading(false);
        setRefreshing(false);
        showToast('Could not load plans', 'error');
      }
    );
    return unsub;
  }, [uid, showToast]);

  const onRefresh = useCallback(() => {
    // onSnapshot is realtime; surface a brief spinner that clears on next emit.
    setRefreshing(true);
  }, []);

  // ---- Membership helpers (memoized as callbacks bound to uid) ----
  const isArchivedForMe = useCallback(
    (plan: Plan) => plan.archivedBy?.includes(uid) === true,
    [uid]
  );
  const isPinnedForMe = useCallback(
    (plan: Plan) => plan.pinnedBy?.includes(uid) === true,
    [uid]
  );

  // ---- Actions ----
  const handleArchive = useCallback(
    async (planId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await updateDoc(doc(db, 'plans', planId), { archivedBy: arrayUnion(uid) });
        showToast('Plan archived');
      } catch {
        showToast('Failed to archive plan', 'error');
      }
    },
    [uid, showToast]
  );

  const handleUnarchive = useCallback(
    async (planId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        await updateDoc(doc(db, 'plans', planId), { archivedBy: arrayRemove(uid) });
        showToast('Plan restored');
      } catch {
        showToast('Failed to restore plan', 'error');
      }
    },
    [uid, showToast]
  );

  const handlePin = useCallback(
    async (planId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await updateDoc(doc(db, 'plans', planId), { pinnedBy: arrayUnion(uid) });
        showToast('Plan pinned');
      } catch {
        showToast('Failed to pin plan', 'error');
      }
    },
    [uid, showToast]
  );

  const handleUnpin = useCallback(
    async (planId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        await updateDoc(doc(db, 'plans', planId), { pinnedBy: arrayRemove(uid) });
        showToast('Plan unpinned');
      } catch {
        showToast('Failed to unpin plan', 'error');
      }
    },
    [uid, showToast]
  );

  const handleDeletePlan = useCallback(
    (item: Plan) => {
      Alert.alert('Delete Plan', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await deleteDoc(doc(db, 'plans', item.id));
              showToast('Plan deleted');
            } catch {
              showToast('Failed to delete plan', 'error');
            }
          },
        },
      ]);
    },
    [showToast]
  );

  const handleLeavePlan = useCallback(
    (item: Plan) => {
      Alert.alert('Leave Plan', 'You will be removed from this plan.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            try {
              await updateDoc(doc(db, 'plans', item.id), {
                participants: arrayRemove(uid),
                votes: arrayRemove(uid),
              });
              showToast('Left plan');
            } catch {
              showToast('Failed to leave plan', 'error');
            }
          },
        },
      ]);
    },
    [uid, showToast]
  );

  // ---- Context sheet ----
  const showContextMenu = useCallback(
    (plan: Plan) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setContextPlan(plan);
      contextSheetY.setValue(300);
      Animated.spring(contextSheetY, {
        toValue: 0,
        tension: 80,
        friction: 12,
        useNativeDriver: true,
      }).start();
    },
    [contextSheetY]
  );

  const hideContextMenu = useCallback(() => {
    Animated.timing(contextSheetY, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setContextPlan(null));
  }, [contextSheetY]);

  // ---- Navigation helpers ----
  const openPlan = useCallback(
    (id: string) => router.push({ pathname: '/plan-detail', params: { id } }),
    [router]
  );
  const openChat = useCallback(
    (id: string, title: string) =>
      router.push({ pathname: '/chat', params: { planId: id, planTitle: title } }),
    [router]
  );
  const openCreatePlan = useCallback(() => router.push('/create-plan'), [router]);

  // ---- Filtered + sorted list ----
  const filteredPlans = useMemo(() => {
    const term = search.trim().toLowerCase();
    return plans
      .filter((p) => {
        const archived = p.archivedBy?.includes(uid) === true;
        if (filter === 'archived') return archived;
        if (archived) return false;
        if (filter === 'all') return true;
        return p.status === filter;
      })
      .filter((p) => !term || (p.title || '').toLowerCase().includes(term))
      .sort((a, b) => {
        const aPinned = a.pinnedBy?.includes(uid) ? 1 : 0;
        const bPinned = b.pinnedBy?.includes(uid) ? 1 : 0;
        return bPinned - aPinned;
      });
  }, [plans, filter, search, uid]);

  const keyExtractor = useCallback((item: Plan) => item.id, []);

  const renderPlanItem = useCallback(
    ({ item, index }: { item: Plan; index: number }) => (
      <SwipeablePlanCard
        item={item}
        index={index}
        uid={uid}
        isArchived={isArchivedForMe(item)}
        isPinned={isPinnedForMe(item)}
        onPress={openPlan}
        onLongPress={showContextMenu}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        onDelete={handleDeletePlan}
        onLeave={handleLeavePlan}
        onPin={handlePin}
        onUnpin={handleUnpin}
      />
    ),
    [
      uid,
      isArchivedForMe,
      isPinnedForMe,
      openPlan,
      showContextMenu,
      handleArchive,
      handleUnarchive,
      handleDeletePlan,
      handleLeavePlan,
      handlePin,
      handleUnpin,
    ]
  );

  const greeting = useMemo(getGreeting, []);
  const firstName = displayName.split(' ')[0];
  const avatarLetter = firstName ? firstName[0].toUpperCase() : '?';

  const showFriendCarousel = friendPlans.length > 0 && !search && filter === 'all';

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------
  return (
    <ScreenWrapper>
      <OnboardingSlider visible={showOnboarding} onDone={handleOnboardingDone} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.appTitle}>Quorum</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/activity')}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={HIT_SLOP}
            >
              <Ionicons name="notifications-outline" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, styles.addBtn]}
              onPress={openCreatePlan}
              accessibilityRole="button"
              accessibilityLabel="Create plan"
              hitSlop={HIT_SLOP}
            >
              <Ionicons name="add" size={22} color={Colors.background} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Greeting row */}
        <View style={styles.greetingRow}>
          <View style={styles.greetingTextWrap}>
            <Text style={styles.greetingLine}>{greeting},</Text>
            <Text style={styles.greetingName} numberOfLines={1}>
              {firstName || 'there'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.avatarCircle}
            onPress={() => router.push('/profile')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarLetter}>{avatarLetter}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter pills */}
      <View style={styles.pillsWrapper}>
        <CategoryPillRow
          pills={FILTER_PILLS}
          selected={filter}
          onSelect={(v) => setFilter(v as StatusFilter)}
        />
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={17} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search plans..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch('')}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Friends' plans carousel */}
      {showFriendCarousel && (
        <View style={styles.friendSection}>
          <Text style={styles.sectionLabel}>Friends&apos; Plans</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendScroll}
          >
            {friendPlans.map((item) => (
              <FriendPlanCard key={item.id} item={item} onPress={openPlan} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Plan list */}
      {loading ? (
        <View style={styles.skeletonWrap}>
          {SKELETON_KEYS.map((k) => (
            <SkeletonCard key={k} />
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredPlans}
          keyExtractor={keyExtractor}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={9}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.text}
              colors={[Colors.text]}
            />
          }
          ListEmptyComponent={
            filter === 'all' && !search ? (
              <FirstRunEmptyState onCreate={openCreatePlan} />
            ) : (
              <FilteredEmptyState search={search} filter={filter} />
            )
          }
          renderItem={renderPlanItem}
        />
      )}

      {/* Long-press context sheet */}
      <ContextSheet
        plan={contextPlan}
        uid={uid}
        translateY={contextSheetY}
        isPinned={contextPlan ? isPinnedForMe(contextPlan) : false}
        isArchived={contextPlan ? isArchivedForMe(contextPlan) : false}
        onClose={hideContextMenu}
        onView={openPlan}
        onChat={openChat}
        onPin={handlePin}
        onUnpin={handleUnpin}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        onDelete={handleDeletePlan}
        onLeave={handleLeavePlan}
      />
    </ScreenWrapper>
  );
}

// ---------------------------------------------------------------------------
// Friend plan card (carousel item)
// ---------------------------------------------------------------------------

type FriendPlanCardProps = {
  item: FriendPlan;
  onPress: (id: string) => void;
};

const FriendPlanCard = React.memo(function FriendPlanCard({
  item,
  onPress,
}: FriendPlanCardProps) {
  const confirmed = item.status === 'confirmed';
  return (
    <GlassCard noAnimate style={styles.friendCard} onPress={() => onPress(item.id)}>
      <Text style={styles.friendTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.friendMeta} numberOfLines={1}>
        {item.friendName} is going
      </Text>
      <View style={styles.friendStatusBadge}>
        <Text style={styles.friendStatusText}>{confirmed ? 'Confirmed' : 'Voting'}</Text>
      </View>
    </GlassCard>
  );
});

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

const FirstRunEmptyState = React.memo(function FirstRunEmptyState({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <View style={styles.onboarding}>
      <Ionicons
        name="calendar-outline"
        size={52}
        color={Colors.textMuted}
        style={styles.dimIcon}
      />
      <Text style={styles.onboardingTitle}>Welcome to Quorum</Text>
      <Text style={styles.onboardingSubtitle}>Plan together, decide together.</Text>
      <GlassCard style={styles.stepsCard} noAnimate>
        {ONBOARDING_STEPS.map((s) => (
          <View key={s.step} style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{s.step}</Text>
            </View>
            <View style={styles.flex1}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepDesc}>{s.desc}</Text>
            </View>
          </View>
        ))}
      </GlassCard>
      <TouchableOpacity
        style={styles.emptyBtn}
        onPress={onCreate}
        accessibilityRole="button"
        accessibilityLabel="Create your first plan"
      >
        <Text style={styles.emptyBtnText}>Create your first plan</Text>
        <Ionicons name="arrow-forward" size={16} color={Colors.background} style={styles.btnIcon} />
      </TouchableOpacity>
    </View>
  );
});

const FilteredEmptyState = React.memo(function FilteredEmptyState({
  search,
  filter,
}: {
  search: string;
  filter: StatusFilter;
}) {
  const title = search
    ? `No results for "${search}"`
    : filter === 'confirmed'
    ? 'No confirmed plans'
    : filter === 'archived'
    ? 'Nothing archived'
    : 'No pending plans';
  return (
    <View style={styles.emptyFiltered}>
      <Ionicons
        name="calendar-outline"
        size={44}
        color={Colors.textMuted}
        style={styles.dimIcon}
      />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>
        {search ? 'Try a different search term' : 'Try a different filter'}
      </Text>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Swipeable plan card
// ---------------------------------------------------------------------------

type SwipeCardProps = {
  item: Plan;
  index: number;
  uid: string;
  isArchived: boolean;
  isPinned: boolean;
  onPress: (id: string) => void;
  onLongPress: (plan: Plan) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (plan: Plan) => void;
  onLeave: (plan: Plan) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
};

const SwipeablePlanCard = React.memo(function SwipeablePlanCard({
  item,
  index,
  uid,
  isArchived,
  isPinned,
  onPress,
  onLongPress,
  onArchive,
  onUnarchive,
  onDelete,
  onLeave,
  onPin,
  onUnpin,
}: SwipeCardProps) {
  const swipeRef = useRef<Swipeable>(null);
  const isCreator = item.createdBy === uid;
  const countdown = getCountdown(item.dateTimestamp);
  const pct = quorumPercent(item);

  const runAndClose = useCallback((cb: () => void) => {
    swipeRef.current?.close();
    cb();
  }, []);

  const handlePress = useCallback(() => onPress(item.id), [onPress, item.id]);
  const handleLongPress = useCallback(() => onLongPress(item), [onLongPress, item]);

  const renderLeftActions = useCallback(
    () => (
      <View style={styles.swipeLeftActions}>
        {isPinned ? (
          <TouchableOpacity
            style={styles.swipeNeutralAction}
            onPress={() => runAndClose(() => onUnpin(item.id))}
            accessibilityRole="button"
            accessibilityLabel="Unpin plan"
          >
            <Ionicons name="bookmark" size={20} color={Colors.text} />
            <Text style={styles.swipeActionText}>Unpin</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.swipeNeutralAction}
            onPress={() => runAndClose(() => onPin(item.id))}
            accessibilityRole="button"
            accessibilityLabel="Pin plan"
          >
            <Ionicons name="bookmark-outline" size={20} color={Colors.text} />
            <Text style={styles.swipeActionText}>Pin</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [isPinned, runAndClose, onPin, onUnpin, item.id]
  );

  const renderRightActions = useCallback(
    () => (
      <View style={styles.swipeRightActions}>
        {isArchived ? (
          <TouchableOpacity
            style={[styles.swipeAction, styles.swipeActionSpaced]}
            onPress={() => runAndClose(() => onUnarchive(item.id))}
            accessibilityRole="button"
            accessibilityLabel="Restore plan"
          >
            <Ionicons name="arrow-up-circle-outline" size={18} color={Colors.text} />
            <Text style={styles.swipeActionText}>Restore</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.swipeAction, styles.swipeActionSpaced]}
            onPress={() => runAndClose(() => onArchive(item.id))}
            accessibilityRole="button"
            accessibilityLabel="Archive plan"
          >
            <Ionicons name="archive-outline" size={18} color={Colors.text} />
            <Text style={styles.swipeActionText}>Archive</Text>
          </TouchableOpacity>
        )}
        {isCreator ? (
          <TouchableOpacity
            style={[styles.swipeAction, styles.swipeActionStrong]}
            onPress={() => runAndClose(() => onDelete(item))}
            accessibilityRole="button"
            accessibilityLabel="Delete plan"
          >
            <Ionicons name="trash-outline" size={18} color={Colors.background} />
            <Text style={[styles.swipeActionText, styles.swipeActionTextInverse]}>Delete</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.swipeAction}
            onPress={() => runAndClose(() => onLeave(item))}
            accessibilityRole="button"
            accessibilityLabel="Leave plan"
          >
            <Ionicons name="exit-outline" size={18} color={Colors.text} />
            <Text style={styles.swipeActionText}>Leave</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [isArchived, isCreator, runAndClose, onArchive, onUnarchive, onDelete, onLeave, item]
  );

  const statusLabel = isArchived
    ? 'Archived'
    : item.status === 'confirmed'
    ? 'Confirmed'
    : 'Pending';
  const categoryLabel = isArchived
    ? 'ARCHIVED'
    : item.status === 'confirmed'
    ? 'CONFIRMED'
    : 'ACTIVE';

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      rightThreshold={40}
      leftThreshold={40}
      friction={2}
    >
      <GlassCard index={index} onPress={handlePress} onLongPress={handleLongPress}>
        {/* Cover image with overlays */}
        <View style={styles.coverWrap}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="image-outline" size={28} color={Colors.textDisabled} />
            </View>
          )}
          <View
            style={[
              styles.imageBadge,
              item.status === 'confirmed' && !isArchived
                ? styles.imageBadgeConfirmed
                : styles.imageBadgePending,
            ]}
          >
            <Text style={styles.imageBadgeText}>{statusLabel}</Text>
          </View>
          {countdown && (
            <View style={styles.countdownBadge}>
              <Ionicons name="time-outline" size={11} color={Colors.background} />
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          )}
          {isPinned && (
            <View style={styles.pinnedBadge}>
              <Ionicons name="bookmark" size={12} color={Colors.background} />
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardCategoryLabel}>
            {item.category ? `${item.category.toUpperCase()} • ` : ''}
            {categoryLabel}
          </Text>

          <Text style={styles.planTitle} numberOfLines={2}>
            {item.title}
          </Text>

          {(item.date || item.location) && (
            <View style={styles.metaRow}>
              {item.date ? (
                <View style={styles.metaChip}>
                  <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
                  <Text style={styles.metaText}>{item.date}</Text>
                </View>
              ) : null}
              {item.location ? (
                <View style={styles.metaChip}>
                  <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {item.location}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          <View style={styles.progressWrapper}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>Quorum Status</Text>
              <Text style={styles.progressPct}>{pct}%</Text>
            </View>
            <QuorumProgressBar votes={item.votes?.length || 0} required={item.requiredVotes || 3} />
          </View>

          <View style={styles.viewDetailsBtn}>
            <Text style={styles.viewDetailsBtnText}>
              {isCreator ? 'Manage Plan →' : 'View Details →'}
            </Text>
          </View>
        </View>
      </GlassCard>
    </Swipeable>
  );
});

// ---------------------------------------------------------------------------
// Context bottom sheet
// ---------------------------------------------------------------------------

type ContextSheetProps = {
  plan: Plan | null;
  uid: string;
  translateY: Animated.Value;
  isPinned: boolean;
  isArchived: boolean;
  onClose: () => void;
  onView: (id: string) => void;
  onChat: (id: string, title: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (plan: Plan) => void;
  onLeave: (plan: Plan) => void;
};

function ContextSheet({
  plan,
  uid,
  translateY,
  isPinned,
  isArchived,
  onClose,
  onView,
  onChat,
  onPin,
  onUnpin,
  onArchive,
  onUnarchive,
  onDelete,
  onLeave,
}: ContextSheetProps) {
  return (
    <Modal visible={!!plan} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.contextOverlay} activeOpacity={1} onPress={onClose}>
        <Animated.View style={[styles.contextSheet, { transform: [{ translateY }] }]}>
          <View style={styles.contextHandle} />
          {plan && (
            <>
              <Text style={styles.contextTitle} numberOfLines={1}>
                {plan.title}
              </Text>
              <View style={styles.contextDivider} />

              <TouchableOpacity
                style={styles.contextRow}
                onPress={() => {
                  onClose();
                  onView(plan.id);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="eye-outline" size={20} color={Colors.text} />
                <Text style={styles.contextLabel}>View Plan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contextRow}
                onPress={() => {
                  onClose();
                  onChat(plan.id, plan.title);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="chatbubble-outline" size={20} color={Colors.text} />
                <Text style={styles.contextLabel}>Open Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contextRow}
                onPress={() => {
                  onClose();
                  if (isPinned) onUnpin(plan.id);
                  else onPin(plan.id);
                }}
                accessibilityRole="button"
              >
                <Ionicons
                  name={isPinned ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color={Colors.text}
                />
                <Text style={styles.contextLabel}>{isPinned ? 'Unpin' : 'Pin to Top'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contextRow}
                onPress={() => {
                  onClose();
                  if (isArchived) onUnarchive(plan.id);
                  else onArchive(plan.id);
                }}
                accessibilityRole="button"
              >
                <Ionicons
                  name={isArchived ? 'arrow-up-circle-outline' : 'archive-outline'}
                  size={20}
                  color={Colors.textSecondary}
                />
                <Text style={styles.contextLabel}>{isArchived ? 'Restore' : 'Archive'}</Text>
              </TouchableOpacity>

              <View style={styles.contextDivider} />

              {plan.createdBy === uid ? (
                <TouchableOpacity
                  style={styles.contextRow}
                  onPress={() => {
                    onClose();
                    onDelete(plan);
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  <Text style={[styles.contextLabel, styles.contextLabelStrong]}>Delete Plan</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.contextRow}
                  onPress={() => {
                    onClose();
                    onLeave(plan);
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="exit-outline" size={20} color={Colors.error} />
                  <Text style={[styles.contextLabel, styles.contextLabelStrong]}>Leave Plan</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles — Monochrome design system
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex1: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  appTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingTextWrap: { flex: 1 },
  greetingLine: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.1,
  },
  greetingName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.8,
    marginTop: 2,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: Radius.full,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.primaryBorder,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  avatarLetter: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: Colors.background,
  },

  // Filter pills
  pillsWrapper: { paddingVertical: Spacing.sm },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.container,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.md,
    paddingVertical: 12,
  },

  // Friends carousel
  friendSection: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.container,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  friendScroll: {
    paddingHorizontal: Spacing.container,
    gap: 10,
    paddingVertical: 4,
  },
  friendCard: {
    width: 160,
    minHeight: 110,
    marginBottom: 0,
    padding: Spacing.sm,
  },
  friendTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    lineHeight: 22,
  },
  friendMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  friendStatusBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
  },
  friendStatusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },

  // Plan list
  skeletonWrap: { paddingHorizontal: Spacing.md },
  listContent: {
    paddingHorizontal: Spacing.container,
    paddingBottom: 110,
    flexGrow: 1,
  },

  // Plan card
  coverWrap: { position: 'relative' },
  coverImage: {
    width: '100%',
    height: 200,
    borderRadius: 0,
    backgroundColor: Colors.surfaceBright,
  },
  coverPlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.surfaceBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  imageBadgePending: {
    backgroundColor: Colors.overlay,
  },
  imageBadgeConfirmed: {
    backgroundColor: Colors.secondary,
  },
  imageBadgeText: {
    color: Colors.background,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  countdownBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.overlay,
  },
  countdownText: {
    color: Colors.background,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
  pinnedBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 24,
    height: 24,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlay,
  },
  cardBody: {
    padding: Spacing.md,
    gap: 8,
  },
  cardCategoryLabel: {
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  planTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  progressWrapper: {
    gap: 6,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
  },
  viewDetailsBtn: {
    alignSelf: 'flex-end',
    paddingTop: 4,
  },
  viewDetailsBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    letterSpacing: 0.2,
  },

  // Swipe actions
  swipeLeftActions: { flexDirection: 'row', marginVertical: 6 },
  swipeRightActions: { flexDirection: 'row', marginVertical: 6 },
  swipeNeutralAction: {
    backgroundColor: Colors.surfaceBright,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.md,
    gap: 4,
  },
  swipeAction: {
    backgroundColor: Colors.surfaceBright,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.md,
    gap: 4,
  },
  swipeActionSpaced: { marginRight: 4 },
  swipeActionStrong: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  swipeActionText: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  swipeActionTextInverse: {
    color: Colors.background,
  },

  // Empty states
  dimIcon: { opacity: 0.6 },
  btnIcon: { marginLeft: 6 },
  onboarding: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 56,
    gap: 12,
  },
  onboardingTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  onboardingSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
    lineHeight: 22,
  },
  stepsCard: {
    width: '100%',
    padding: Spacing.md,
    gap: 16,
    marginBottom: 4,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: { color: Colors.background, fontWeight: FontWeight.black, fontSize: 13 },
  stepTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    lineHeight: 22,
  },
  stepDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadow.primary,
  },
  emptyBtnText: {
    color: Colors.background,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.md,
  },
  emptyFiltered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },

  // Context bottom sheet
  contextOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  contextSheet: {
    backgroundColor: Colors.surfaceOverlay,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: 12,
    paddingBottom: 36,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contextHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  contextTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: Colors.text,
    paddingHorizontal: 4,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  contextDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    minHeight: 48,
  },
  contextLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  contextLabelStrong: {
    color: Colors.error,
  },
});
