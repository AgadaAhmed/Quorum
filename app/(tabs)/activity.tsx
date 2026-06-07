import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import ScreenWrapper from '../../components/ScreenWrapper';
import AnimatedButton from '../../components/AnimatedButton';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';

// ─── Types ───────────────────────────────────────────────────────────────────

type ActivityType =
  | 'plan_confirmed'
  | 'plan_joined'
  | 'plan_cancelled'
  | 'friend_accepted';

type FirestoreTimestamp = { toDate: () => Date };

type ActivityItem = {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: FirestoreTimestamp | Date | number | string | null;
  planId?: string;
};

type FriendRequest = {
  fromId: string;
  fromName: string;
  fromUsername?: string;
  fromAvatar?: string;
};

type FilterKey = 'all' | 'plans' | 'friends';

const FILTERS: readonly FilterKey[] = ['all', 'plans', 'friends'] as const;
const TIME_GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'] as const;

// Expand the tap area of the compact filter pills to a comfortable target.
const PILL_HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 } as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMillis(ts: ActivityItem['timestamp']): number {
  if (ts == null) return 0;
  if (typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function') {
    const d = ts.toDate();
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const d = new Date(ts as Date | number | string);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function formatRelTime(ts: ActivityItem['timestamp']): string {
  const t = toMillis(ts);
  if (!t) return '';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTimeGroup(ts: ActivityItem['timestamp']): string {
  const t = toMillis(ts);
  if (!t) return 'Earlier';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;
  if (t >= todayStart) return 'Today';
  if (t >= yesterdayStart) return 'Yesterday';
  if (t >= weekStart) return 'This Week';
  return 'Earlier';
}

function getIconName(type: ActivityType): keyof typeof Ionicons.glyphMap {
  if (type === 'plan_confirmed') return 'checkmark-circle';
  if (type === 'plan_cancelled') return 'close-circle';
  if (type === 'friend_accepted') return 'people';
  return 'person-add';
}

// ─── Local sub-components ─────────────────────────────────────────────────────

const FilterPill = React.memo(function FilterPill({
  filter,
  active,
  onPress,
}: {
  filter: FilterKey;
  active: boolean;
  onPress: (f: FilterKey) => void;
}) {
  const label = filter.charAt(0).toUpperCase() + filter.slice(1);
  return (
    <TouchableOpacity
      style={[styles.filterPill, active && styles.filterPillActive]}
      onPress={() => onPress(filter)}
      activeOpacity={0.7}
      hitSlop={PILL_HIT_SLOP}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Show ${label}`}
    >
      <Text
        style={[styles.filterPillText, active && styles.filterPillTextActive]}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const HighlightCard = React.memo(function HighlightCard({
  item,
  onPress,
}: {
  item: ActivityItem;
  onPress: (item: ActivityItem) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.highlightCard}
      onPress={() => onPress(item)}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${item.message}. Quorum reached.`}
    >
      <View style={styles.highlightImagePlaceholder}>
        <Ionicons
          name="people"
          size={64}
          color={Colors.borderStrong}
          style={styles.highlightWatermark}
        />
      </View>
      <View style={styles.highlightOverlay}>
        <View style={styles.highlightMetaRow}>
          <Ionicons name="checkmark-circle" size={14} color={Colors.background} />
          <Text style={styles.highlightSub}>QUORUM REACHED</Text>
        </View>
        <Text style={styles.highlightTitle} numberOfLines={2}>
          {item.message}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const RequestCard = React.memo(function RequestCard({
  req,
  processing,
  onAccept,
  onDecline,
}: {
  req: FriendRequest;
  processing: boolean;
  onAccept: (req: FriendRequest) => void;
  onDecline: (req: FriendRequest) => void;
}) {
  const initial = (req.fromName || '?').charAt(0).toUpperCase();
  return (
    <View style={styles.requestCard}>
      <View style={styles.requestRow}>
        {req.fromAvatar ? (
          <Image source={{ uri: req.fromAvatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}

        <View style={styles.requestInfo}>
          <Text style={styles.requestName} numberOfLines={1}>
            {req.fromName}
          </Text>
          {req.fromUsername ? (
            <Text style={styles.requestUsername} numberOfLines={1}>
              @{req.fromUsername}
            </Text>
          ) : null}
        </View>

        <View style={styles.requestActions}>
          <AnimatedButton
            label="Decline"
            variant="ghost"
            size="sm"
            disabled={processing}
            onPress={() => onDecline(req)}
            style={styles.declineBtn}
          />
          <AnimatedButton
            label="Accept"
            variant="primary"
            size="sm"
            loading={processing}
            onPress={() => onAccept(req)}
            style={styles.acceptBtn}
          />
        </View>
      </View>
    </View>
  );
});

const ActivityRow = React.memo(function ActivityRow({
  item,
  onPress,
}: {
  item: ActivityItem;
  onPress: (item: ActivityItem) => void;
}) {
  const iconName = getIconName(item.type);
  const pressable = !!item.planId && item.type !== 'plan_cancelled';
  return (
    <TouchableOpacity
      onPress={pressable ? () => onPress(item) : undefined}
      disabled={!pressable}
      activeOpacity={0.7}
      style={styles.activityItem}
      accessibilityRole={pressable ? 'button' : 'text'}
      accessibilityLabel={`${item.message}. ${formatRelTime(item.timestamp)}`}
    >
      <View style={styles.activityRow}>
        <View style={styles.iconCircle}>
          <Ionicons name={iconName} size={20} color={Colors.text} />
        </View>
        <Text style={styles.activityMessage} numberOfLines={2}>
          {item.message}
        </Text>
        <Text
          style={styles.activityTime}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {formatRelTime(item.timestamp)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const SkeletonCard = React.memo(function SkeletonCard({
  shimmer,
}: {
  shimmer: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View style={styles.skeletonCard} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.skeletonRow}>
        <Animated.View style={[styles.skeletonCircle, { opacity: shimmer }]} />
        <View style={styles.skeletonLines}>
          <Animated.View
            style={[styles.skeletonLine, styles.skeletonLineMain, { opacity: shimmer }]}
          />
          <Animated.View
            style={[styles.skeletonLine, styles.skeletonLineSub, { opacity: shimmer }]}
          />
        </View>
      </View>
    </View>
  );
});

// Drives a calm opacity pulse shared by all skeleton rows during loading.
function useShimmer(active: boolean) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, value]);
  return value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const router = useRouter();
  const [uid, setUid] = useState(auth.currentUser?.uid || '');

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid || ''));
  }, []);

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingReq, setProcessingReq] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  // Keep a mutable ref to friend-derived items so refresh can merge with latest
  const friendItemsRef = useRef<ActivityItem[]>([]);

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchPlanItems = useCallback(async (): Promise<ActivityItem[]> => {
    if (!uid) return [];
    const plansQuery = query(
      collection(db, 'plans'),
      where('participants', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const snap = await getDocs(plansQuery);
    const planItems: ActivityItem[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      const ts = data.createdAt ?? null;
      const title = data.title ?? 'Untitled plan';
      if (data.status === 'confirmed') {
        planItems.push({
          id: `confirmed-${d.id}`,
          type: 'plan_confirmed',
          message: `"${title}" reached quorum`,
          timestamp: ts,
          planId: d.id,
        });
      }
      if (data.status === 'cancelled') {
        planItems.push({
          id: `cancelled-${d.id}`,
          type: 'plan_cancelled',
          message: `"${title}" was cancelled`,
          timestamp: ts,
          planId: d.id,
        });
      }
      if (data.createdBy === uid) {
        planItems.push({
          id: `created-${d.id}`,
          type: 'plan_joined',
          message: `You created "${title}"`,
          timestamp: ts,
          planId: d.id,
        });
      } else {
        planItems.push({
          id: `joined-${d.id}`,
          type: 'plan_joined',
          message: `You joined "${title}"`,
          timestamp: ts,
          planId: d.id,
        });
      }
    });
    return planItems;
  }, [uid]);

  const mergeAndSetItems = useCallback(
    (planItems: ActivityItem[], friendItems: ActivityItem[]) => {
      const merged = [...planItems, ...friendItems];
      merged.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
      setItems(merged);
    },
    []
  );

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setFriendRequests([]);
      friendItemsRef.current = [];
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // Initial plan fetch
    fetchPlanItems()
      .then((planItems) => {
        if (cancelled) return;
        mergeAndSetItems(planItems, friendItemsRef.current);
      })
      .catch(() => {
        /* keep existing items; surfaced via empty/refresh */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Friend requests + accepted friends — real-time
    const userUnsub = onSnapshot(
      doc(db, 'users', uid),
      async (snap) => {
        const data = snap.data();
        const requests: any[] = data?.friendRequests || [];
        const friendIds: string[] = data?.friends || [];

        // Enrich pending requests with profile data
        const enrichedRequests = await Promise.all(
          requests.map(async (r) => {
            try {
              const profileSnap = await getDoc(doc(db, 'users', r.fromId));
              const profile = profileSnap.data();
              return {
                fromId: r.fromId,
                fromName: r.fromName || profile?.displayName || 'Unknown',
                fromUsername: profile?.username,
                fromAvatar: profile?.photoURL,
              } as FriendRequest;
            } catch {
              return {
                fromId: r.fromId,
                fromName: r.fromName || 'Unknown',
              } as FriendRequest;
            }
          })
        );
        if (cancelled) return;
        setFriendRequests(enrichedRequests);

        // Recent friends as activity items (cap at 5)
        const recentFriends = friendIds.slice(0, 5);
        const friendDocs = await Promise.all(
          recentFriends.map((id) => getDoc(doc(db, 'users', id)).catch(() => null))
        );
        const acceptedItems: ActivityItem[] = friendDocs
          .filter((d): d is NonNullable<typeof d> => !!d && d.exists())
          .map((d) => ({
            id: `friend-${d.id}`,
            type: 'friend_accepted' as const,
            message: `You and ${d.data()?.displayName ?? 'a friend'} are now friends`,
            timestamp: null,
          }));

        if (cancelled) return;
        friendItemsRef.current = acceptedItems;
        setItems((prev) => {
          const planItems = prev.filter((i) => !i.id.startsWith('friend-'));
          return [...planItems, ...acceptedItems].sort(
            (a, b) => toMillis(b.timestamp) - toMillis(a.timestamp)
          );
        });
      },
      () => {
        /* snapshot error — ignore, list stays as-is */
      }
    );

    return () => {
      cancelled = true;
      userUnsub();
    };
  }, [uid, fetchPlanItems, mergeAndSetItems]);

  const onRefresh = useCallback(async () => {
    if (!uid) return;
    setRefreshing(true);
    try {
      const planItems = await fetchPlanItems();
      mergeAndSetItems(planItems, friendItemsRef.current);
    } catch {
      /* keep existing items */
    } finally {
      setRefreshing(false);
    }
  }, [uid, fetchPlanItems, mergeAndSetItems]);

  // ── Friend request actions ──────────────────────────────────────────────────

  const acceptRequest = useCallback(
    async (req: FriendRequest) => {
      if (!uid) return;
      setProcessingReq(req.fromId);
      try {
        const mySnap = await getDoc(doc(db, 'users', uid));
        const currentRequests: any[] = mySnap.data()?.friendRequests || [];
        await updateDoc(doc(db, 'users', uid), {
          friends: arrayUnion(req.fromId),
          friendRequests: currentRequests.filter((r) => r.fromId !== req.fromId),
        });
        await updateDoc(doc(db, 'users', req.fromId), {
          friends: arrayUnion(uid),
        });
      } catch {
        // silent fail — snapshot will update UI anyway
      } finally {
        setProcessingReq(null);
      }
    },
    [uid]
  );

  const declineRequest = useCallback(
    async (req: FriendRequest) => {
      if (!uid) return;
      setProcessingReq(req.fromId);
      try {
        const mySnap = await getDoc(doc(db, 'users', uid));
        const currentRequests: any[] = mySnap.data()?.friendRequests || [];
        await updateDoc(doc(db, 'users', uid), {
          friendRequests: currentRequests.filter((r) => r.fromId !== req.fromId),
        });
      } catch {
        // silent fail
      } finally {
        setProcessingReq(null);
      }
    },
    [uid]
  );

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handleItemPress = useCallback(
    (item: ActivityItem) => {
      if (item.planId && item.type !== 'plan_cancelled') {
        router.push({ pathname: '/plan-detail', params: { id: item.planId } });
      }
    },
    [router]
  );

  const handleHighlightPress = useCallback(
    (item: ActivityItem) => {
      if (item.planId) {
        router.push({ pathname: '/plan-detail', params: { id: item.planId } });
      }
    },
    [router]
  );

  const handleSetFilter = useCallback((f: FilterKey) => setActiveFilter(f), []);
  const handleViewAll = useCallback(() => router.push('/discover' as any), [router]);

  // ── Derived data (memoized) ───────────────────────────────────────────────────

  const highlights = useMemo(
    () => items.filter((i) => i.type === 'plan_confirmed').slice(0, 2),
    [items]
  );

  // Filter tab applied to the activity feed (previously a no-op bug).
  const filteredItems = useMemo(() => {
    if (activeFilter === 'plans') {
      return items.filter((i) => i.type !== 'friend_accepted');
    }
    if (activeFilter === 'friends') {
      return items.filter((i) => i.type === 'friend_accepted');
    }
    return items;
  }, [items, activeFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, ActivityItem[]>();
    filteredItems.forEach((item) => {
      const label = getTimeGroup(item.timestamp);
      const arr = map.get(label);
      if (arr) arr.push(item);
      else map.set(label, [item]);
    });
    return Array.from(map.entries())
      .map(([label, data]) => ({ label, data }))
      .sort(
        (a, b) =>
          TIME_GROUP_ORDER.indexOf(a.label as (typeof TIME_GROUP_ORDER)[number]) -
          TIME_GROUP_ORDER.indexOf(b.label as (typeof TIME_GROUP_ORDER)[number])
      );
  }, [filteredItems]);

  const shimmer = useShimmer(loading);

  const showHighlights = !loading && activeFilter !== 'friends' && highlights.length > 0;
  const showFriendRequests = activeFilter !== 'plans' && friendRequests.length > 0;
  const isEmpty =
    !loading && filteredItems.length === 0 && !showFriendRequests && !showHighlights;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ScreenWrapper>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>QUORUM</Text>
          <TouchableOpacity
            hitSlop={styles.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Search"
            onPress={() => router.push('/discover' as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="search-outline" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <FilterPill
              key={f}
              filter={f}
              active={activeFilter === f}
              onPress={handleSetFilter}
            />
          ))}
        </View>

        {/* Weekly Highlights — shown when we have confirmed plans to display */}
        {showHighlights && (
          <View style={styles.highlightsSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Weekly Highlights</Text>
              <TouchableOpacity
                onPress={handleViewAll}
                hitSlop={styles.hitSlop}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View all highlights"
                style={styles.viewAllRow}
              >
                <Text style={styles.viewAllLink}>View All</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {highlights.map((item) => (
              <HighlightCard key={item.id} item={item} onPress={handleHighlightPress} />
            ))}
          </View>
        )}

        {/* Friend Requests section */}
        {showFriendRequests && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Friend Requests</Text>
            {friendRequests.map((req) => (
              <RequestCard
                key={req.fromId}
                req={req}
                processing={processingReq === req.fromId}
                onAccept={acceptRequest}
                onDecline={declineRequest}
              />
            ))}
          </View>
        )}

        {/* Recent activity section */}
        {(loading || filteredItems.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Live Updates</Text>

            {loading ? (
              <>
                <SkeletonCard shimmer={shimmer} />
                <SkeletonCard shimmer={shimmer} />
                <SkeletonCard shimmer={shimmer} />
                <SkeletonCard shimmer={shimmer} />
              </>
            ) : (
              groups.map((group) => (
                <View key={group.label}>
                  <Text style={styles.timeGroupLabel}>{group.label}</Text>
                  {group.data.map((item) => (
                    <ActivityRow key={item.id} item={item} onPress={handleItemPress} />
                  ))}
                </View>
              ))
            )}
          </View>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View style={styles.empty}>
            <View style={styles.emptyIconRing}>
              <Ionicons
                name="pulse-outline"
                size={32}
                color={Colors.textSecondary}
              />
            </View>
            <Text style={styles.emptyText}>
              {activeFilter === 'friends'
                ? 'No friend activity yet'
                : activeFilter === 'plans'
                ? 'No plan activity yet'
                : 'All quiet here'}
            </Text>
            <Text style={styles.emptySubText}>
              {activeFilter === 'friends'
                ? 'Friend requests and new connections will show up here.'
                : activeFilter === 'plans'
                ? 'Plan confirmations and updates will show up here.'
                : 'Friend requests, plan confirmations, and activity will show up here.'}
            </Text>
            <View style={styles.emptyAction}>
              <AnimatedButton
                label="Discover plans"
                variant="secondary"
                size="sm"
                onPress={handleViewAll}
                icon={
                  <Ionicons name="compass-outline" size={16} color={Colors.text} />
                }
              />
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingBottom: 120,
  },

  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: 4,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.container,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs * 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterPill: {
    paddingHorizontal: Spacing.gutter,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.background,
    minHeight: 40,
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterPillText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  filterPillTextActive: {
    color: Colors.background,
    fontWeight: FontWeight.heavy,
  },
  highlightsSection: {
    paddingTop: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.container,
    marginBottom: Spacing.sm,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllLink: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  highlightCard: {
    marginHorizontal: Spacing.container,
    marginBottom: Spacing.sm,
    height: 132,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  highlightImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightWatermark: {
    opacity: 0.25,
  },
  highlightOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.overlay,
  },
  highlightMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  highlightTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.heavy,
    color: Colors.background,
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  highlightSub: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.background,
    letterSpacing: 1.2,
  },

  // Sections
  section: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.container,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },

  // Friend request card
  requestCard: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryDim,
    borderWidth: 1.5,
    borderColor: Colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  requestInfo: {
    flex: 1,
    minWidth: 0,
  },
  requestName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  requestUsername: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Spacing.xs * 2,
    alignItems: 'center',
  },
  acceptBtn: {
    minWidth: 84,
  },
  declineBtn: {
    minWidth: 84,
  },

  // Activity item
  activityItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activityMessage: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: FontWeight.medium,
    lineHeight: 22,
    paddingTop: 1,
  },
  activityTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    flexShrink: 0,
    minWidth: 52,
    textAlign: 'right',
    paddingTop: 3,
    fontVariant: ['tabular-nums'],
  },

  // Skeleton
  skeletonCard: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  skeletonCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceOverlay,
  },
  skeletonLines: {
    flex: 1,
  },
  skeletonLine: {
    height: 12,
    borderRadius: Radius.xs,
    backgroundColor: Colors.surfaceOverlay,
  },
  skeletonLineMain: {
    width: '65%',
  },
  skeletonLineSub: {
    width: '40%',
    marginTop: 6,
  },

  // Time group label (Today / Yesterday / This Week / Earlier)
  timeGroupLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xxl + Spacing.lg,
    paddingHorizontal: Spacing.container,
  },
  emptyIconRing: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  emptySubText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: Spacing.md,
    alignSelf: 'center',
  },
});
