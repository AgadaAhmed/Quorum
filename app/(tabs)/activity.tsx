import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
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
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
  const uid = auth.currentUser?.uid || '';

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingReq, setProcessingReq] = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!uid) return;

    const planItems: ActivityItem[] = [];
    const friendItems: ActivityItem[] = [];

    const mergeAndSet = () => {
      const merged = [...planItems, ...friendItems];
      merged.sort((a, b) => {
        const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return bTime - aTime;
      });
      setItems([...merged]);
    };

    // Task 1: Recent plans
    const plansQuery = query(
      collection(db, 'plans'),
      where('participants', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    getDocs(plansQuery)
      .then((snap) => {
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
        mergeAndSet();
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Task 2: Friend requests + accepted friends — real-time
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

      friendItems.length = 0;
      friendItems.push(...acceptedItems);
      mergeAndSet();
    });

    return () => userUnsub();
  }, [uid]);

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
      >
        {/* Header */}
        <Text style={styles.title}>Activity</Text>

        {/* Friend Requests section */}
        {friendRequests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Friend Requests</Text>
            {friendRequests.map((req, index) => (
              <GlassCard
                key={req.fromId}
                index={index}
                glowColor={Colors.primary}
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
              </GlassCard>
            ))}
          </View>
        )}

        {/* Recent activity section */}
        {(loading || items.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Recent</Text>

            {loading
              ? [0, 1, 2, 3].map((i) => (
                  <GlassCard key={i} noAnimate style={styles.skeletonCard}>
                    <View style={styles.skeletonRow}>
                      <View style={styles.skeletonCircle} />
                      <View style={styles.skeletonLines}>
                        <View style={[styles.skeletonLine, { width: '65%' }]} />
                        <View style={[styles.skeletonLine, { width: '40%', marginTop: 6 }]} />
                      </View>
                    </View>
                  </GlassCard>
                ))
              : items.map((item, index) => {
                  const color = getIconColor(item.type);
                  const iconName = getIconName(item.type);
                  return (
                    <GlassCard
                      key={item.id}
                      index={index}
                      onPress={
                        item.planId && item.type !== 'plan_cancelled'
                          ? () => handleItemPress(item)
                          : undefined
                      }
                      style={styles.activityCard}
                    >
                      <View style={styles.activityRow}>
                        {/* Icon circle */}
                        <View
                          style={[
                            styles.iconCircle,
                            { backgroundColor: color + '18', borderColor: color + '55' },
                          ]}
                        >
                          <Ionicons name={iconName} size={20} color={color} />
                        </View>

                        {/* Message */}
                        <Text style={styles.activityMessage} numberOfLines={2}>
                          {item.message}
                        </Text>

                        {/* Timestamp */}
                        <Text style={styles.activityTime}>
                          {formatRelTime(item.timestamp)}
                        </Text>
                      </View>
                    </GlassCard>
                  );
                })}
          </View>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View style={styles.empty}>
            <Ionicons name="pulse-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyText}>All quiet here</Text>
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
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },

  // Header
  title: {
    fontSize: 34,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    letterSpacing: -0.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },

  // Friend request card
  requestCard: {
    padding: Spacing.md,
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
    color: Colors.textMuted,
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

  // Activity item card
  activityCard: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activityMessage: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    lineHeight: 20,
  },
  activityTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    flexShrink: 0,
  },

  // Skeleton
  skeletonCard: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
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
    color: Colors.textMuted,
  },
});
