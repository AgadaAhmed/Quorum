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

const CATEGORY_EMOJI: Record<string, string> = {
  Music: '🎵', Food: '🍔', Sports: '⚽', Art: '🎨',
  Gaming: '🎮', Travel: '✈️', Party: '🎉', Study: '📚',
};

const FILTER_PILLS = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Archived', value: 'archived' },
];

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getCountdown = (dateTimestamp?: string): string | null => {
  if (!dateTimestamp) return null;
  const date = new Date(dateTimestamp);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff < 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today!';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `In ${days} days`;
  return null;
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getStatusGlow(status: Plan['status'], archived: boolean): string {
  if (archived) return Colors.textDisabled;
  if (status === 'confirmed') return Colors.secondary;   // teal for confirmed
  return Colors.primary;                                  // indigo for pending
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [uid, setUid] = useState(auth.currentUser?.uid || '');

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid || ''));
  }, []);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [friendPlans, setFriendPlans] = useState<{
    id: string; title: string; friendName: string; status: string; category?: string;
  }[]>([]);
  const [contextPlan, setContextPlan] = useState<Plan | null>(null);
  const contextSheetY = useRef(new Animated.Value(300)).current;

  const { showToast } = useToast();

  // ---- Onboarding check ----
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (snap.exists() && !snap.data()?.onboardingDone) {
        setShowOnboarding(true);
      }
    });
  }, [uid]);

  const handleOnboardingDone = async () => {
    setShowOnboarding(false);
    if (uid) await updateDoc(doc(db, 'users', uid), { onboardingDone: true });
  };

  // ---- Friends' plans ----
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then(async (snap) => {
      const friendIds: string[] = snap.data()?.friends || [];
      if (friendIds.length === 0) return;
      const friendDocs = await Promise.all(
        friendIds.slice(0, 10).map((fid) => getDoc(doc(db, 'users', fid)))
      );
      const nameMap: Record<string, string> = {};
      friendDocs.forEach((d) => {
        if (d.exists()) nameMap[d.id] = d.data()?.displayName || d.data()?.username || 'Friend';
      });
      const friendPlanSnap = await getDocs(
        query(collection(db, 'plans'), where('isPublic', '==', true), orderBy('createdAt', 'desc'), limit(30))
      );
      const results: typeof friendPlans = [];
      friendPlanSnap.docs.forEach((d) => {
        const data = d.data();
        const participants: string[] = data.participants || [];
        if (participants.includes(uid)) return;
        const friendMatch = friendIds.find((fid) => participants.includes(fid));
        if (friendMatch) {
          results.push({
            id: d.id, title: data.title,
            friendName: nameMap[friendMatch] || 'Friend',
            status: data.status, category: data.category,
          });
        }
      });
      setFriendPlans(results.slice(0, 8));
    });
  }, [uid]);

  // ---- My plans subscription ----
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'plans'),
      where('participants', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Plan)));
      setLoading(false);
      setRefreshing(false);
    });
    return unsub;
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // onSnapshot fires setRefreshing(false) once data arrives
  }, []);

  // ---- Helpers ----
  const isArchivedForMe = (plan: Plan) => plan.archivedBy?.includes(uid) === true;
  const isPinnedForMe = (plan: Plan) => plan.pinnedBy?.includes(uid) === true;

  // ---- Actions ----
  const handleArchive = async (planId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await updateDoc(doc(db, 'plans', planId), { archivedBy: arrayUnion(uid) });
      showToast('Plan archived');
    } catch { showToast('Failed to archive plan', 'error'); }
  };

  const handleUnarchive = async (planId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateDoc(doc(db, 'plans', planId), { archivedBy: arrayRemove(uid) });
      showToast('Plan restored');
    } catch { showToast('Failed to restore plan', 'error'); }
  };

  const handlePin = async (planId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await updateDoc(doc(db, 'plans', planId), { pinnedBy: arrayUnion(uid) });
      showToast('Plan pinned');
    } catch { showToast('Failed to pin plan', 'error'); }
  };

  const handleUnpin = async (planId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateDoc(doc(db, 'plans', planId), { pinnedBy: arrayRemove(uid) });
      showToast('Plan unpinned');
    } catch { showToast('Failed to unpin plan', 'error'); }
  };

  const handleDeletePlan = (item: Plan) => {
    Alert.alert('Delete Plan', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          try {
            await deleteDoc(doc(db, 'plans', item.id));
            showToast('Plan deleted');
          } catch { showToast('Failed to delete plan', 'error'); }
        },
      },
    ]);
  };

  const handleLeavePlan = (item: Plan) => {
    Alert.alert('Leave Plan', 'You will be removed from this plan.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          try {
            await updateDoc(doc(db, 'plans', item.id), {
              participants: arrayRemove(uid),
              votes: arrayRemove(uid),
            });
            showToast('Left plan');
          } catch { showToast('Failed to leave plan', 'error'); }
        },
      },
    ]);
  };

  // ---- Context sheet ----
  const showContextMenu = (plan: Plan) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setContextPlan(plan);
    contextSheetY.setValue(300);
    Animated.spring(contextSheetY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
  };

  const hideContextMenu = () => {
    Animated.timing(contextSheetY, { toValue: 300, duration: 200, useNativeDriver: true }).start(
      () => setContextPlan(null)
    );
  };

  // ---- Filtered list ----
  const filteredPlans = useMemo(() => plans
    .filter((p) => {
      const archived = isArchivedForMe(p);
      if (filter === 'archived') return archived;
      if (archived) return false;
      if (filter === 'all') return true;
      return p.status === filter;
    })
    .filter((p) => {
      if (!search.trim()) return true;
      return p.title.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      const aPinned = isPinnedForMe(a) ? 1 : 0;
      const bPinned = isPinnedForMe(b) ? 1 : 0;
      return bPinned - aPinned;
    }), [plans, filter, search, uid]);

  const keyExtractor = useCallback((item: Plan) => item.id, []);

  const renderPlanItem = useCallback(({ item, index }: { item: Plan; index: number }) => (
    <SwipeablePlanCard
      item={item}
      index={index}
      uid={uid}
      isArchived={isArchivedForMe(item)}
      isPinned={isPinnedForMe(item)}
      onPress={() =>
        router.push({ pathname: '/plan-detail', params: { id: item.id } })
      }
      onLongPress={() => showContextMenu(item)}
      onChatPress={() =>
        router.push({ pathname: '/chat', params: { planId: item.id, planTitle: item.title } })
      }
      onArchive={() => handleArchive(item.id)}
      onUnarchive={() => handleUnarchive(item.id)}
      onDelete={() => handleDeletePlan(item)}
      onLeave={() => handleLeavePlan(item)}
      onPin={() => handlePin(item.id)}
      onUnpin={() => handleUnpin(item.id)}
    />
  ), [uid, router, showContextMenu, handleArchive, handleUnarchive, handleDeletePlan, handleLeavePlan, handlePin, handleUnpin]);

  const greeting = getGreeting();
  // Reactive display name — re-reads when uid changes (i.e. after auth resolves)
  const [displayName, setDisplayName] = useState(
    auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || ''
  );
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setDisplayName(u?.displayName || u?.email?.split('@')[0] || '');
    });
  }, []);
  const firstName = displayName.split(' ')[0];
  const avatarLetter = firstName ? firstName[0].toUpperCase() : '?';

  return (
    <ScreenWrapper>
      <OnboardingSlider visible={showOnboarding} onDone={handleOnboardingDone} />

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.appTitle}>Quorum</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/activity')}
            >
              <Ionicons name="notifications-outline" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, styles.addBtn]}
              onPress={() => router.push('/create-plan')}
            >
              <Ionicons name="add" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Greeting row */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingLine}>{greeting},</Text>
            <Text style={styles.greetingName}>{firstName || 'there'}</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarCircle}
            onPress={() => router.push('/profile')}
            activeOpacity={0.8}
          >
            {auth.currentUser?.photoURL ? (
              <Image source={{ uri: auth.currentUser.photoURL }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarGradient}>
                <Text style={styles.avatarLetter}>{avatarLetter}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Category filter pills                                               */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.pillsWrapper}>
        <CategoryPillRow
          pills={FILTER_PILLS}
          selected={filter}
          onSelect={(v) => setFilter(v as StatusFilter)}
        />
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Search bar                                                          */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={17} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search plans..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Friends' plans carousel                                             */}
      {/* ------------------------------------------------------------------ */}
      {friendPlans.length > 0 && !search && filter === 'all' && (
        <View style={styles.friendSection}>
          <Text style={styles.sectionLabel}>Friends' Plans</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendScroll}
          >
            {friendPlans.map((item) => (
              <GlassCard
                key={item.id}
                noAnimate
                style={styles.friendCard}
                onPress={() =>
                  router.push({ pathname: '/plan-detail', params: { id: item.id } })
                }
              >
                {item.category && (
                  <Text style={styles.friendEmoji}>{CATEGORY_EMOJI[item.category] || '📌'}</Text>
                )}
                <Text style={styles.friendTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.friendMeta}>{item.friendName} is going</Text>
                <View
                  style={[
                    styles.friendStatusBadge,
                    {
                      backgroundColor:
                        item.status === 'confirmed'
                          ? Colors.success + '22'
                          : Colors.primary + '22',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.friendStatusText,
                      {
                        color:
                          item.status === 'confirmed' ? Colors.success : Colors.primaryLight,
                      },
                    ]}
                  >
                    {item.status === 'confirmed' ? 'Confirmed' : 'Voting'}
                  </Text>
                </View>
              </GlassCard>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Plan list                                                           */}
      {/* ------------------------------------------------------------------ */}
      {loading ? (
        <View style={{ paddingHorizontal: Spacing.md }}>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={filteredPlans}
          keyExtractor={keyExtractor}
          removeClippedSubviews={true}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            filter === 'all' && !search ? (
              /* First-time empty state */
              <View style={styles.onboarding}>
                <Ionicons name="calendar-outline" size={52} color={Colors.primary} style={{ opacity: 0.6 }} />
                <Text style={styles.onboardingTitle}>Welcome to Quorum</Text>
                <Text style={styles.onboardingSubtitle}>Plan together, decide together.</Text>
                <GlassCard style={styles.stepsCard} noAnimate>
                  {[
                    { step: '1', title: 'Create a plan', desc: 'Pick an activity, set a date and location' },
                    { step: '2', title: 'Invite friends', desc: 'Add friends and share the plan with them' },
                    { step: '3', title: 'Reach quorum', desc: 'Once enough people vote, the plan is confirmed' },
                  ].map((s) => (
                    <View key={s.step} style={styles.stepRow}>
                      <View style={styles.stepBadge}>
                        <Text style={styles.stepBadgeText}>{s.step}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stepTitle}>{s.title}</Text>
                        <Text style={styles.stepDesc}>{s.desc}</Text>
                      </View>
                    </View>
                  ))}
                </GlassCard>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push('/create-plan')}
                >
                  <Text style={styles.emptyBtnText}>Create your first plan</Text>
                  <Ionicons name="arrow-forward" size={16} color={Colors.text} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>
            ) : (
              /* Filtered empty state */
              <View style={styles.emptyFiltered}>
                <Ionicons name="calendar-outline" size={44} color={Colors.textMuted} style={{ opacity: 0.5 }} />
                <Text style={styles.emptyTitle}>
                  {search
                    ? `No results for "${search}"`
                    : filter === 'confirmed'
                    ? 'No confirmed plans'
                    : filter === 'archived'
                    ? 'Nothing archived'
                    : 'No pending plans'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {search ? 'Try a different search term' : 'Try a different filter'}
                </Text>
              </View>
            )
          }
          renderItem={renderPlanItem}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Long-press context sheet                                            */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        visible={!!contextPlan}
        transparent
        animationType="none"
        onRequestClose={hideContextMenu}
      >
        <TouchableOpacity
          style={styles.contextOverlay}
          activeOpacity={1}
          onPress={hideContextMenu}
        >
          <Animated.View
            style={[styles.contextSheet, { transform: [{ translateY: contextSheetY }] }]}
          >
            <View style={styles.contextHandle} />
            {contextPlan && (
              <>
                <Text style={styles.contextTitle} numberOfLines={1}>
                  {contextPlan.title}
                </Text>
                <View style={styles.contextDivider} />

                <TouchableOpacity
                  style={styles.contextRow}
                  onPress={() => {
                    hideContextMenu();
                    router.push({ pathname: '/plan-detail', params: { id: contextPlan.id } });
                  }}
                >
                  <Ionicons name="eye-outline" size={20} color={Colors.text} />
                  <Text style={styles.contextLabel}>View Plan</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.contextRow}
                  onPress={() => {
                    hideContextMenu();
                    router.push({ pathname: '/chat', params: { planId: contextPlan.id, planTitle: contextPlan.title } });
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={20} color={Colors.text} />
                  <Text style={styles.contextLabel}>Open Chat</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.contextRow}
                  onPress={() => {
                    hideContextMenu();
                    isPinnedForMe(contextPlan)
                      ? handleUnpin(contextPlan.id)
                      : handlePin(contextPlan.id);
                  }}
                >
                  <Ionicons
                    name={isPinnedForMe(contextPlan) ? 'bookmark' : 'bookmark-outline'}
                    size={20}
                    color={Colors.gold}
                  />
                  <Text style={[styles.contextLabel, { color: Colors.gold }]}>
                    {isPinnedForMe(contextPlan) ? 'Unpin' : 'Pin to Top'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.contextRow}
                  onPress={() => {
                    hideContextMenu();
                    isArchivedForMe(contextPlan)
                      ? handleUnarchive(contextPlan.id)
                      : handleArchive(contextPlan.id);
                  }}
                >
                  <Ionicons
                    name={isArchivedForMe(contextPlan) ? 'arrow-up-circle-outline' : 'archive-outline'}
                    size={20}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.contextLabel}>
                    {isArchivedForMe(contextPlan) ? 'Restore' : 'Archive'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.contextDivider} />

                {contextPlan.createdBy === uid ? (
                  <TouchableOpacity
                    style={styles.contextRow}
                    onPress={() => { hideContextMenu(); handleDeletePlan(contextPlan); }}
                  >
                    <Ionicons name="trash-outline" size={20} color={Colors.error} />
                    <Text style={[styles.contextLabel, { color: Colors.error }]}>Delete Plan</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.contextRow}
                    onPress={() => { hideContextMenu(); handleLeavePlan(contextPlan); }}
                  >
                    <Ionicons name="exit-outline" size={20} color={Colors.error} />
                    <Text style={[styles.contextLabel, { color: Colors.error }]}>Leave Plan</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </ScreenWrapper>
  );
}

// ---------------------------------------------------------------------------
// Swipeable plan card
// ---------------------------------------------------------------------------

type SwipeCardProps = {
  item: Plan;
  index: number;
  uid: string;
  isArchived: boolean;
  isPinned: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onChatPress: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onLeave: () => void;
  onPin: () => void;
  onUnpin: () => void;
};

function SwipeablePlanCard({
  item, index, uid, isArchived, isPinned,
  onPress, onLongPress, onChatPress,
  onArchive, onUnarchive, onDelete, onLeave, onPin, onUnpin,
}: SwipeCardProps) {
  const swipeRef = useRef<any>(null);
  const isCreator = item.createdBy === uid;
  const participants: string[] = item.participants || [];
  const countdown = getCountdown(item.dateTimestamp);
  const glowColor = getStatusGlow(item.status, isArchived);

  const close = (cb: () => void) => {
    swipeRef.current?.close();
    cb();
  };

  const renderLeftActions = () => (
    <View style={styles.swipeLeftActions}>
      {isPinned ? (
        <TouchableOpacity style={styles.swipeUnpin} onPress={() => close(onUnpin)}>
          <Ionicons name="bookmark" size={20} color={Colors.gold} />
          <Text style={styles.swipeActionText}>Unpin</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.swipePin} onPress={() => close(onPin)}>
          <Ionicons name="bookmark-outline" size={20} color={Colors.text} />
          <Text style={styles.swipeActionText}>Pin</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderRightActions = () => (
    <View style={styles.swipeRightActions}>
      {isArchived ? (
        <TouchableOpacity style={styles.swipeRestore} onPress={() => close(onUnarchive)}>
          <Ionicons name="arrow-up-circle-outline" size={18} color={Colors.text} />
          <Text style={styles.swipeActionText}>Restore</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.swipeArchive} onPress={() => close(onArchive)}>
          <Ionicons name="archive-outline" size={18} color={Colors.text} />
          <Text style={styles.swipeActionText}>Archive</Text>
        </TouchableOpacity>
      )}
      {isCreator ? (
        <TouchableOpacity style={styles.swipeDelete} onPress={() => close(onDelete)}>
          <Ionicons name="trash-outline" size={18} color={Colors.text} />
          <Text style={styles.swipeActionText}>Delete</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.swipeLeave} onPress={() => close(onLeave)}>
          <Ionicons name="exit-outline" size={18} color={Colors.text} />
          <Text style={styles.swipeActionText}>Leave</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      rightThreshold={40}
      friction={2}
    >
      <GlassCard
        index={index}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        {/* Cover image with status badge overlay */}
        <View style={{ position: 'relative' }}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder} />
          )}
          {/* Status badge overlaid on image */}
          <View style={[
            styles.imageBadge,
            item.status === 'confirmed' ? styles.imageBadgeConfirmed : styles.imageBadgePending,
          ]}>
            <Text style={styles.imageBadgeText}>
              {isArchived ? 'Archived' : item.status === 'confirmed' ? '• Confirmed' : '• Pending'}
            </Text>
          </View>
          {isPinned && (
            <View style={styles.pinnedBadge}>
              <Ionicons name="bookmark" size={12} color={Colors.gold} />
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          {/* Category • Status label */}
          <Text style={styles.cardCategoryLabel}>
            {item.category ? `${item.category.toUpperCase()} • ` : ''}
            {isArchived ? 'ARCHIVED' : item.status === 'confirmed' ? 'CONFIRMED' : 'ACTIVE'}
          </Text>

          {/* Plan title */}
          <Text style={styles.planTitle} numberOfLines={2}>{item.title}</Text>

          {/* Date + location */}
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
                <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
              </View>
            ) : null}
          </View>

          {/* Quorum Status */}
          <View style={styles.progressWrapper}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>Quorum Status</Text>
              <Text style={styles.progressPct}>
                {Math.round(Math.min((item.votes?.length || 0) / Math.max(item.requiredVotes || 3, 1), 1) * 100)}%
              </Text>
            </View>
            <QuorumProgressBar
              votes={item.votes?.length || 0}
              required={item.requiredVotes || 3}
            />
          </View>

          {/* Text action button */}
          <TouchableOpacity
            style={styles.viewDetailsBtn}
            onPress={(e) => { e.stopPropagation(); onPress(); }}
            activeOpacity={0.7}
          >
            <Text style={styles.viewDetailsBtnText}>
              {isCreator ? 'Manage Plan →' : 'View Details →'}
            </Text>
          </TouchableOpacity>
        </View>
      </GlassCard>
    </Swipeable>
  );
}

// ---------------------------------------------------------------------------
// Styles — Social Nexus design system
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // ── Header ──────────────────────────────────────────────────────────────
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
    fontSize: 22,
    fontWeight: '900',
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
    width: 40,
    height: 40,
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
  greetingLine: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.1,
  },
  greetingName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
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
  avatarGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
  avatarLetter: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: '#fff',
  },

  // ── Filter pills ──────────────────────────────────────────────────────
  pillsWrapper: { paddingVertical: Spacing.sm },

  // ── Search ────────────────────────────────────────────────────────────
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

  // ── Friends carousel ─────────────────────────────────────────────────
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
  friendEmoji: { fontSize: 22, marginBottom: 4 },
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
  },
  friendStatusText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  // ── Plan list ─────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: Spacing.container,
    paddingBottom: 110,
  },

  // ── Plan card body ────────────────────────────────────────────────────
  coverImage: {
    width: '100%',
    height: 200,
    borderRadius: 0,
  },
  coverPlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: '#1a1a1a',
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  imageBadgeConfirmed: {
    backgroundColor: Colors.secondary,
  },
  imageBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pinnedBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  cardBody: {
    padding: Spacing.md,
    gap: 8,
  },
  cardCategoryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  planTitle: {
    fontSize: 22,
    fontWeight: '900',
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
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
  },
  viewDetailsBtn: {
    alignSelf: 'flex-end',
    paddingTop: 4,
  },
  viewDetailsBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 0.2,
  },
  // legacy — keep so swipe actions compile
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryPill: {},
  categoryPillText: {},
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: Radius.full },
  statusLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  countdownChip: {},
  countdownChipPending: {},
  countdownText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.bold },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chatBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  votesChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  votesChipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  votedPill: { paddingHorizontal: 8, paddingVertical: 4 },
  votedPillText: { color: Colors.secondaryLight, fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  // ── Swipe actions ─────────────────────────────────────────────────────
  swipeLeftActions: { flexDirection: 'row', marginVertical: 6 },
  swipeRightActions: { flexDirection: 'row', marginVertical: 6 },
  swipePin: {
    backgroundColor: Colors.primary + 'dd',
    justifyContent: 'center', alignItems: 'center',
    width: 72, borderRadius: Radius.md, gap: 4,
  },
  swipeUnpin: {
    backgroundColor: Colors.gold + 'cc',
    justifyContent: 'center', alignItems: 'center',
    width: 72, borderRadius: Radius.md, gap: 4,
  },
  swipeArchive: {
    backgroundColor: Colors.surfaceBright,
    borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
    width: 72, borderRadius: Radius.md, marginRight: 4, gap: 4,
  },
  swipeRestore: {
    backgroundColor: Colors.primary + 'cc',
    justifyContent: 'center', alignItems: 'center',
    width: 72, borderRadius: Radius.md, marginRight: 4, gap: 4,
  },
  swipeDelete: {
    backgroundColor: Colors.tertiary + 'dd',
    justifyContent: 'center', alignItems: 'center',
    width: 72, borderRadius: Radius.md, gap: 4,
  },
  swipeLeave: {
    backgroundColor: Colors.surfaceBright,
    borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
    width: 72, borderRadius: Radius.md, gap: 4,
  },
  swipeActionText: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },

  // ── Empty states ─────────────────────────────────────────────────────
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
    width: 26, height: 26,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: { color: '#fff', fontWeight: FontWeight.black, fontSize: 13 },
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
    ...Shadow.indigo,
  },
  emptyBtnText: {
    color: '#fff',
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
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  // ── Context bottom sheet ──────────────────────────────────────────────
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
  },
  contextLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
});
