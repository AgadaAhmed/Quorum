import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
import { useToast } from '../../components/Toast';
import OnboardingSlider from '../../components/OnboardingSlider';
import CategoryPillRow from '../../components/CategoryPill';
import FriendPlanCard from '../../components/home/FriendPlanCard';
import PlanCardSkeleton from '../../components/home/PlanCardSkeleton';
import SwipeablePlanCard from '../../components/home/SwipeablePlanCard';
import ContextSheet from '../../components/home/ContextSheet';
import { FirstRunEmptyState, FilteredEmptyState } from '../../components/home/EmptyStates';
import {
  FILTER_PILLS,
  SKELETON_KEYS,
  HIT_SLOP,
  StatusFilter,
  Plan,
  FriendPlan,
  getGreeting,
} from '../../components/home/shared';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';

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
              style={[styles.iconBtn, styles.iconBtnGhost]}
              onPress={() => router.push('/activity')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={HIT_SLOP}
            >
              <Ionicons name="notifications-outline" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, styles.addBtn]}
              onPress={openCreatePlan}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create plan"
              hitSlop={HIT_SLOP}
            >
              <Ionicons name="add" size={26} color={Colors.background} />
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
        <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
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
            activeOpacity={0.7}
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
            <PlanCardSkeleton key={k} />
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
// Styles — Monochrome design system
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
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
  // Ghost variant: secondary action recedes so the black + is the lone primary.
  iconBtnGhost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    ...Shadow.primary,
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

  // Plan list
  skeletonWrap: { paddingHorizontal: Spacing.container },
  listContent: {
    paddingHorizontal: Spacing.container,
    paddingBottom: 110,
    flexGrow: 1,
  },
});
