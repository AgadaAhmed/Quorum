import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import GlassCard from '../../components/GlassCard';
import AnimatedButton from '../../components/AnimatedButton';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';

// ─── Types ───────────────────────────────────────────────────────────────────

type ActivityItem = {
  id: string;
  type: 'plan_confirmed' | 'plan_joined' | 'plan_cancelled' | 'friend_accepted';
  message: string;
  timestamp: any;
  planId?: string;
};

type FriendRequest = {
  fromId: string;
  fromName: string;
  fromUsername?: string;
  fromAvatar?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelTime(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTimeGroup(ts: any): string {
  if (!ts) return 'Earlier';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return 'Earlier';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;
  const t = d.getTime();
  if (t >= todayStart) return 'Today';
  if (t >= yesterdayStart) return 'Yesterday';
  if (t >= weekStart) return 'This Week';
  return 'Earlier';
}

function getIconColor(type: ActivityItem['type']) {
  if (type === 'plan_confirmed') return Colors.success;
  if (type === 'plan_cancelled') return Colors.error;
  if (type === 'friend_accepted') return Colors.gold;
  return Colors.primary;
}

function getIconName(type: ActivityItem['type']): keyof typeof Ionicons.glyphMap {
  if (type === 'plan_confirmed') return 'checkmark-circle';
  if (type === 'plan_cancelled') return 'close-circle';
  if (type === 'friend_accepted') return 'people';
  return 'person-add';
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
  const [activeFilter, setActiveFilter] = useState<'all' | 'plans' | 'friends'>('all');

  // Keep a mutable ref to friend-derived items so refresh can merge with latest
  const friendItemsRef = useRef<ActivityItem[]>([]);

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchPlanItems = useCallback(async (): Promise<ActivityItem[]> => {
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
      const ts = data.createdAt || null;
      if (data.status === 'confirmed') {
        planItems.push({
          id: `confirmed-${d.id}`,
          type: 'plan_confirmed',
          message: `"${data.title}" reached quorum`,
          timestamp: ts,
          planId: d.id,
        });
      }
      if (data.status === 'cancelled') {
        planItems.push({
          id: `cancelled-${d.id}`,
          type: 'plan_cancelled',
          message: `"${data.title}" was cancelled`,
          timestamp: ts,
          planId: d.id,
        });
      }
      if (data.createdBy === uid) {
        planItems.push({
          id: `created-${d.id}`,
          type: 'plan_joined',
          message: `You created "${data.title}"`,
          timestamp: ts,
          planId: d.id,
        });
      } else {
        planItems.push({
          id: `joined-${d.id}`,
          type: 'plan_joined',
          message: `You joined "${data.title}"`,
          timestamp: ts,
          planId: d.id,
        });
      }
    });
    return planItems;
  }, [uid]);

  const mergeAndSetItems = useCallback((planItems: ActivityItem[], friendItems: ActivityItem[]) => {
    const merged = [...planItems, ...friendItems];
    merged.sort((a, b) => {
      const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return bTime - aTime;
    });
    setItems([...merged]);
  }, []);

  useEffect(() => {
    if (!uid) return;

    // Initial plan fetch
    fetchPlanItems()
      .then((planItems) => {
        mergeAndSetItems(planItems, friendItemsRef.current);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Friend requests + accepted friends — real-time
    const userUnsub = onSnapshot(doc(db, 'users', uid), async (snap) => {
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
      setFriendRequests(enrichedRequests);

      // Recent friends as activity items (cap at 5)
      const recentFriends = friendIds.slice(0, 5);
      const friendDocs = await Promise.all(
        recentFriends.map((id) => getDoc(doc(db, 'users', id)))
      );
      const acceptedItems: ActivityItem[] = friendDocs
        .filter((d) => d.exists())
        .map((d) => ({
          id: `friend-${d.id}`,
          type: 'friend_accepted' as const,
          message: `You and ${d.data()?.displayName} are now friends`,
          timestamp: null,
        }));

      friendItemsRef.current = acceptedItems;
      setItems((prev) => {
        const planItems = prev.filter((i) => !i.id.startsWith('friend-'));
        return [...planItems, ...acceptedItems].sort((a, b) => {
          const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
          const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
          return bTime - aTime;
        });
      });
    });

    return () => userUnsub();
  }, [uid]);

  const onRefresh = useCallback(async () => {
    if (!uid) return;
    setRefreshing(true);
    try {
      const planItems = await fetchPlanItems();
      mergeAndSetItems(planItems, friendItemsRef.current);
    } finally {
      setRefreshing(false);
    }
  }, [uid, fetchPlanItems, mergeAndSetItems]);

  // ── Friend request actions ──────────────────────────────────────────────────

  const acceptRequest = async (req: FriendRequest) => {
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
  };

  const declineRequest = async (req: FriendRequest) => {
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
  };

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handleItemPress = (item: ActivityItem) => {
    if (item.planId && item.type !== 'plan_cancelled') {
      router.push({ pathname: '/plan-detail', params: { id: item.planId } });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const isEmpty = !loading && items.length === 0 && friendRequests.length === 0;

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
          <Ionicons name="search-outline" size={22} color={Colors.text} />
        </View>

        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {(['all', 'plans', 'friends'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, activeFilter === f && styles.filterPillActive]}
              onPress={() => setActiveFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterPillText, activeFilter === f && styles.filterPillTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Weekly Highlights — shown when we have confirmed plans to display */}
        {items.filter(i => i.type === 'plan_confirmed').length > 0 && (
          <View style={styles.highlightsSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Weekly Highlights</Text>
              <TouchableOpacity onPress={() => router.push('/discover' as any)}>
                <Text style={styles.viewAllLink}>View All</Text>
              </TouchableOpacity>
            </View>
            {items.filter(i => i.type === 'plan_confirmed').slice(0, 2).map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={styles.highlightCard}
                onPress={() => item.planId && router.push({ pathname: '/plan-detail', params: { id: item.planId } })}
                activeOpacity={0.85}
              >
                <View style={styles.highlightImagePlaceholder} />
                <View style={styles.highlightOverlay}>
                  <Text style={styles.highlightTitle}>{item.message}</Text>
                  <Text style={styles.highlightSub}>Quorum reached</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Friend Requests section */}
        {friendRequests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Friend Requests</Text>
            {friendRequests.map((req, index) => (
              <View
                key={req.fromId}
                style={styles.requestCard}
              >
                <View style={styles.requestRow}>
                  {/* Avatar */}
                  {req.fromAvatar ? (
                    <Image source={{ uri: req.fromAvatar }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitial}>
                        {req.fromName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  {/* Name / username */}
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

                  {/* Actions */}
                  <View style={styles.requestActions}>
                    <AnimatedButton
                      label="Accept"
                      variant="primary"
                      size="sm"
                      loading={processingReq === req.fromId}
                      onPress={() => acceptRequest(req)}
                      style={styles.acceptBtn}
                    />
                    <AnimatedButton
                      label="Decline"
                      variant="ghost"
                      size="sm"
                      disabled={processingReq === req.fromId}
                      onPress={() => declineRequest(req)}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recent activity section */}
        {(loading || items.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Live Updates</Text>

            {loading
              ? [0, 1, 2, 3].map((i) => (
                  <View key={i} style={styles.skeletonCard}>
                    <View style={styles.skeletonRow}>
                      <View style={styles.skeletonCircle} />
                      <View style={styles.skeletonLines}>
                        <View style={[styles.skeletonLine, { width: '65%' }]} />
                        <View style={[styles.skeletonLine, { width: '40%', marginTop: 6 }]} />
                      </View>
                    </View>
                  </View>
                ))
              : (() => {
                  // Group items by time bucket
                  const groups: { label: string; data: typeof items }[] = [];
                  const ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'];
                  items.forEach((item) => {
                    const label = getTimeGroup(item.timestamp);
                    let g = groups.find((x) => x.label === label);
                    if (!g) { g = { label, data: [] }; groups.push(g); }
                    g.data.push(item);
                  });
                  groups.sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
                  let cardIdx = 0;
                  return groups.map((group) => (
                    <View key={group.label}>
                      <Text style={styles.timeGroupLabel}>{group.label}</Text>
                      {group.data.map((item) => {
                        const color = getIconColor(item.type);
                        const iconName = getIconName(item.type);
                        const ci = cardIdx++;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            onPress={
                              item.planId && item.type !== 'plan_cancelled'
                                ? () => handleItemPress(item)
                                : undefined
                            }
                            activeOpacity={0.7}
                            style={styles.activityItem}
                          >
                            <View style={styles.activityRow}>
                              <View style={[styles.iconCircle, { backgroundColor: color + '15' }]}>
                                <Ionicons name={iconName} size={18} color={color} />
                              </View>
                              <Text style={styles.activityMessage} numberOfLines={2}>
                                {item.message}
                              </Text>
                              <Text style={styles.activityTime}>
                                {formatRelTime(item.timestamp)}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ));
                })()}
          </View>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View style={styles.empty}>
            <Ionicons name="pulse-outline" size={56} color={Colors.textMuted} style={{ opacity: 0.5 }} />
            <Text style={styles.emptyText}>All quiet here</Text>
            <Text style={styles.emptySubText}>
              Friend requests, plan confirmations, and activity will show up here.
            </Text>
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
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 3,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.container,
    paddingVertical: Spacing.sm,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterPillText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterPillTextActive: {
    color: '#ffffff',
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
  viewAllLink: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  highlightCard: {
    marginHorizontal: Spacing.container,
    marginBottom: Spacing.sm,
    height: 120,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  highlightImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surfaceRaised,
  },
  highlightOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  highlightTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  highlightSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  // Sections
  section: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.container,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },

  // Friend request card
  requestCard: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    gap: 8,
    alignItems: 'center',
  },
  acceptBtn: {
    minWidth: 72,
  },

  // Activity item
  activityItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activityMessage: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: FontWeight.medium,
    lineHeight: 20,
  },
  activityTime: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    flexShrink: 0,
  },

  // Skeleton
  skeletonCard: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skeletonCircle: {
    width: 44,
    height: 44,
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

  // Time group label (Today / Yesterday / This Week / Earlier)
  timeGroupLabel: {
    fontSize: 11,
    fontWeight: '800',
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
    paddingTop: 100,
    gap: 12,
  },
  emptyText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  emptySubText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    lineHeight: 20,
    opacity: 0.7,
  },
});
