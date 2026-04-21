import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
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
  if (archived) return Colors.textMuted;
  if (status === 'confirmed') return Colors.success;
  return Colors.primary;
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
  const uid = auth.currentUser?.uid || '';

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
  const filteredPlans = plans
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
    });

  const greeting = getGreeting();
  const firstName = (
    auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || ''
  ).split(' ')[0];
  const avatarLetter = firstName ? firstName[0].toUpperCase() : '?';

  return (
    <ScreenWrapper showTabBar>
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
              <LinearGradient
                colors={[Colors.primary, '#7c3aed']}
                style={styles.avatarGradient}
              >
                <Text style={styles.avatarLetter}>{avatarLetter}</Text>
              </LinearGradient>
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
          keyExtractor={(p) => p.id}
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
          renderItem={({ item, index }) => (
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
          )}
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
        glowColor={glowColor}
      >
        {/* Cover image or gradient placeholder */}
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={['#f43f5e22', '#100d14']}
            style={styles.coverGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}

        <View style={styles.cardBody}>
          {/* Category pill + status row */}
          <View style={styles.cardTopRow}>
            {item.category ? (
              <View style={styles.categoryPill}>
                <Text style={styles.categoryPillText}>
                  {CATEGORY_EMOJI[item.category] || '📌'} {item.category}
                </Text>
              </View>
            ) : <View />}

            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: item.status === 'confirmed' ? Colors.success : Colors.primary },
                ]}
              />
              <Text style={[
                styles.statusLabel,
                { color: item.status === 'confirmed' ? Colors.success : Colors.primary },
              ]}>
                {isArchived ? 'Archived' : item.status === 'confirmed' ? 'Confirmed' : 'Pending'}
              </Text>
              {isPinned && (
                <Ionicons name="bookmark" size={13} color={Colors.gold} style={{ marginLeft: 4 }} />
              )}
            </View>
          </View>

          {/* Plan title */}
          <Text style={styles.planTitle} numberOfLines={2}>{item.title}</Text>

          {/* Meta chips row */}
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
            {participants.length > 0 && (
              <View style={styles.metaChip}>
                <Ionicons name="people-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.metaText}>{participants.length}</Text>
              </View>
            )}
            {item.status === 'confirmed' && countdown ? (
              <View style={[styles.metaChip, styles.countdownChip]}>
                <Ionicons name="time-outline" size={12} color={Colors.success} />
                <Text style={styles.countdownText}>{countdown}</Text>
              </View>
            ) : null}
          </View>

          {/* Progress bar */}
          <View style={styles.progressWrapper}>
            <QuorumProgressBar
              votes={item.votes?.length || 0}
              required={item.requiredVotes || 3}
            />
          </View>

          {/* Card action row */}
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.selectionAsync();
                onChatPress();
              }}
            >
              <Ionicons name="chatbubble-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.chatBtnText}>Chat</Text>
            </TouchableOpacity>
            <View style={styles.votesChip}>
              <Ionicons name="thumbs-up-outline" size={12} color={Colors.primary} />
              <Text style={styles.votesChipText}>
                {item.votes?.length || 0}/{item.requiredVotes || 3}
              </Text>
            </View>
          </View>
        </View>
      </GlassCard>
    </Swipeable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Header
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
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
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryBorder,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingLine: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  greetingName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.primaryBorder,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: Colors.text,
  },

  // Filter pills
  pillsWrapper: {
    paddingVertical: Spacing.sm,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.md,
    paddingVertical: 11,
  },

  // Friends carousel
  friendSection: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  friendScroll: {
    paddingHorizontal: Spacing.md,
    gap: 10,
    paddingVertical: 4,
  },
  friendCard: {
    width: 168,
    minHeight: 116,
    marginBottom: 0,
    padding: 14,
  },
  friendEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  friendTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    lineHeight: 20,
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
  friendStatusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },

  // Plan list
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 32,
  },

  // Plan card body
  coverImage: {
    width: '100%',
    height: 160,
  },
  coverGradient: {
    width: '100%',
    height: 80,
  },
  cardBody: {
    padding: Spacing.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  categoryPill: {
    backgroundColor: Colors.primaryDim,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  categoryPillText: {
    fontSize: FontSize.xs,
    color: Colors.primaryLight,
    fontWeight: FontWeight.semibold,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
  },
  statusLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  planTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    marginBottom: Spacing.sm,
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  countdownChip: {
    backgroundColor: Colors.successDim,
  },
  countdownText: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: FontWeight.bold,
  },
  progressWrapper: {
    marginBottom: Spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  chatBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  votesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryDim,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  votesChipText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },

  // Swipe actions
  swipeLeftActions: {
    flexDirection: 'row',
    marginVertical: 6,
  },
  swipeRightActions: {
    flexDirection: 'row',
    marginVertical: 6,
  },
  swipePin: {
    backgroundColor: Colors.primary + 'cc',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.md,
    gap: 4,
  },
  swipeUnpin: {
    backgroundColor: Colors.gold + 'cc',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.md,
    gap: 4,
  },
  swipeArchive: {
    backgroundColor: Colors.gold + 'cc',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.md,
    marginRight: 4,
    gap: 4,
  },
  swipeRestore: {
    backgroundColor: Colors.primary + 'cc',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.md,
    marginRight: 4,
    gap: 4,
  },
  swipeDelete: {
    backgroundColor: Colors.error + 'cc',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.md,
    gap: 4,
  },
  swipeLeave: {
    backgroundColor: Colors.textMuted + 'cc',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.md,
    gap: 4,
  },
  swipeActionText: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },

  // Empty states
  onboarding: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 56,
    gap: 12,
  },
  onboardingTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  onboardingSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  stepsCard: {
    width: '100%',
    padding: Spacing.md,
    gap: 16,
    marginBottom: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: Radius.xs,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    color: Colors.text,
    fontWeight: FontWeight.black,
    fontSize: 12,
  },
  stepTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  stepDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyBtn: {
    marginTop: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadow.rose,
  },
  emptyBtnText: {
    color: Colors.text,
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
  },

  // Context sheet
  contextOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  contextSheet: {
    backgroundColor: Colors.surfaceRaised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 36,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  contextHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.glassBorder,
    alignSelf: 'center',
    marginBottom: 16,
  },
  contextTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: Colors.text,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  contextDivider: {
    height: 1,
    backgroundColor: Colors.glassBorder,
    marginVertical: 6,
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
