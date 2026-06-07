import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../lib/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import AnimatedCard from '../components/AnimatedCard';
import AnimatedButton from '../components/AnimatedButton';
import { SkeletonProfile } from '../components/SkeletonLoader';
import { useToast } from '../components/Toast';
import { Colors, Fonts, FontSize, FontWeight, Radius, Shadow, Spacing } from '../lib/theme';

type Profile = {
  displayName: string;
  username?: string;
  bio?: string;
  city?: string;
  country?: string;
  friends?: string[];
  avatarUrl?: string;
};

type FriendRequest = { fromId: string; fromName?: string };

type PlanSummary = {
  id: string;
  title?: string;
  status?: string;
  date?: { seconds?: number } | null;
};

type RelationStatus = 'self' | 'friend' | 'pending_incoming' | 'pending_outgoing' | 'none';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

// ── Helpers ──────────────────────────────────────────────────────────────────
function getInitial(name?: string): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed[0].toUpperCase() : 'U';
}

function formatPlanDate(date?: { seconds?: number } | null): string | null {
  const seconds = date?.seconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const d = new Date(seconds * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const uid = auth.currentUser?.uid || '';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [planCount, setPlanCount] = useState(0);
  const [relation, setRelation] = useState<RelationStatus>('none');
  const [myRequests, setMyRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [mutualCount, setMutualCount] = useState(0);
  const [theirPlans, setTheirPlans] = useState<PlanSummary[]>([]);

  const avatarScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  // ── Load profile, plan count, and relationship status ──────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    setLoading(true);

    (async () => {
      try {
        const [profileSnap, plansSnap, mySnap] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          getDocs(query(collection(db, 'plans'), where('participants', 'array-contains', userId))),
          uid ? getDoc(doc(db, 'users', uid)) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const profileData = profileSnap.exists() ? (profileSnap.data() as Profile) : null;
        setProfile(profileData);
        setPlanCount(plansSnap.size);

        const myData = mySnap?.data();
        const myFriends: string[] = myData?.friends ?? [];
        const myIncoming: FriendRequest[] = myData?.friendRequests ?? [];
        setMyRequests(myIncoming);

        const theirFriends: string[] = profileData?.friends ?? [];
        setMutualCount(myFriends.filter((id) => theirFriends.includes(id)).length);

        if (!uid || userId === uid) {
          setRelation('self');
        } else if (myFriends.includes(userId)) {
          setRelation('friend');
        } else if (myIncoming.some((r) => r.fromId === userId)) {
          setRelation('pending_incoming');
        } else {
          // We already have the target user's doc — reuse it to detect a request we sent.
          const theirRequests: FriendRequest[] = profileSnap.data()?.friendRequests ?? [];
          setRelation(theirRequests.some((r) => r.fromId === uid) ? 'pending_outgoing' : 'none');
        }
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (cancelled) return;
        setLoading(false);
        Animated.parallel([
          Animated.spring(avatarScale, { toValue: 1, tension: 60, friction: 7, delay: 100, useNativeDriver: true }),
          Animated.timing(contentOpacity, { toValue: 1, duration: 400, delay: 150, useNativeDriver: true }),
        ]).start();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, uid, avatarScale, contentOpacity]);

  // ── Live subscription to their recent public plans ─────────────────────────
  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'plans'),
      where('createdBy', '==', userId),
      where('isPublic', '==', true),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setTheirPlans(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlanSummary, 'id'>) }))),
      () => setTheirPlans([])
    );
    return unsub;
  }, [userId]);

  // ── Friend actions ─────────────────────────────────────────────────────────
  const handleAddFriend = useCallback(async () => {
    if (!userId || !uid || actionLoading) return;
    setActionLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const mySnap = await getDoc(doc(db, 'users', uid));
      const myName = mySnap.data()?.displayName || 'Someone';
      await updateDoc(doc(db, 'users', userId), {
        friendRequests: arrayUnion({ fromId: uid, fromName: myName }),
      });
      setRelation('pending_outgoing');
      showToast(`Request sent to ${profile?.displayName ?? 'user'}`);
    } catch {
      showToast('Failed to send request', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [userId, uid, actionLoading, profile?.displayName, showToast]);

  const handleUnfriend = useCallback(async () => {
    if (!userId || !uid || actionLoading) return;
    setActionLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await Promise.all([
        updateDoc(doc(db, 'users', uid), { friends: arrayRemove(userId) }),
        updateDoc(doc(db, 'users', userId), { friends: arrayRemove(uid) }),
      ]);
      setRelation('none');
      showToast('Removed from friends');
    } catch {
      showToast('Failed to unfriend', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [userId, uid, actionLoading, showToast]);

  const handleAccept = useCallback(async () => {
    if (!userId || !uid || actionLoading) return;
    setActionLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const filtered = myRequests.filter((r) => r.fromId !== userId);
      await Promise.all([
        updateDoc(doc(db, 'users', uid), { friends: arrayUnion(userId), friendRequests: filtered }),
        updateDoc(doc(db, 'users', userId), { friends: arrayUnion(uid) }),
      ]);
      setRelation('friend');
      setMyRequests(filtered);
      showToast(`You and ${profile?.displayName ?? 'user'} are now friends`);
    } catch {
      showToast('Failed to accept request', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [userId, uid, actionLoading, myRequests, profile?.displayName, showToast]);

  const handleDecline = useCallback(async () => {
    if (!userId || !uid || actionLoading) return;
    setActionLoading(true);
    try {
      const filtered = myRequests.filter((r) => r.fromId !== userId);
      await updateDoc(doc(db, 'users', uid), { friendRequests: filtered });
      setRelation('none');
      setMyRequests(filtered);
      showToast('Request declined');
    } catch {
      showToast('Failed to decline request', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [userId, uid, actionLoading, myRequests, showToast]);

  const handleCancelRequest = useCallback(async () => {
    if (!userId || !uid || actionLoading) return;
    setActionLoading(true);
    try {
      const theirSnap = await getDoc(doc(db, 'users', userId));
      const existing: FriendRequest[] = theirSnap.data()?.friendRequests ?? [];
      const filtered = existing.filter((r) => r.fromId !== uid);
      await updateDoc(doc(db, 'users', userId), { friendRequests: filtered });
      setRelation('none');
      showToast('Request cancelled');
    } catch {
      showToast('Failed to cancel request', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [userId, uid, actionLoading, showToast]);

  const goBack = useCallback(() => router.back(), [router]);

  const openPlan = useCallback(
    (id: string) => router.push({ pathname: '/plan-detail', params: { id } } as any),
    [router]
  );

  // ── Derived values ─────────────────────────────────────────────────────────
  const initials = useMemo(() => getInitial(profile?.displayName), [profile?.displayName]);
  const friendCount = profile?.friends?.length ?? 0;
  const locationLabel = useMemo(
    () => [profile?.city, profile?.country].filter(Boolean).join(', '),
    [profile?.city, profile?.country]
  );
  const headerTitle = profile?.username
    ? `@${profile.username}`
    : profile?.displayName || 'Profile';

  // ── Loading / not-found states ─────────────────────────────────────────────
  if (loading) {
    return (
      <ScreenWrapper>
        <ProfileHeader title="Profile" onBack={goBack} />
        <SkeletonProfile />
      </ScreenWrapper>
    );
  }

  if (!profile) {
    return (
      <ScreenWrapper>
        <ProfileHeader title="Profile" onBack={goBack} />
        <View style={styles.centered}>
          <Ionicons name="person-circle-outline" size={72} color={Colors.textMuted} />
          <Text style={styles.notFoundText}>User not found</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ProfileHeader title={headerTitle} onBack={goBack} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar + identity */}
        <Animated.View style={[styles.avatarSection, { opacity: contentOpacity }]}>
          <Animated.View style={[styles.avatarCircle, { transform: [{ scale: avatarScale }] }]}>
            {profile.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl }}
                style={styles.avatarImage}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </Animated.View>

          <Text style={styles.displayName} numberOfLines={1}>
            {profile.displayName}
          </Text>
          {!!profile.username && <Text style={styles.usernameHandle}>@{profile.username}</Text>}

          {(!!locationLabel || mutualCount > 0) && (
            <View style={styles.metaGroup}>
              {!!locationLabel && (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {locationLabel}
                  </Text>
                </View>
              )}

              {mutualCount > 0 && (
                <View style={styles.metaRow}>
                  <Ionicons name="people-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {mutualCount} mutual friend{mutualCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Relationship actions */}
          {relation !== 'self' && (
            <View style={styles.friendActions}>
              {relation === 'friend' && (
                <AnimatedButton
                  label="Friends"
                  onPress={handleUnfriend}
                  variant="secondary"
                  loading={actionLoading}
                  disabled={actionLoading}
                  style={styles.actionBtn}
                  icon={<Ionicons name="checkmark-circle" size={18} color={Colors.text} />}
                  accessibilityLabel="You are friends. Tap to remove friend"
                />
              )}
              {relation === 'none' && (
                <AnimatedButton
                  label="Add Friend"
                  onPress={handleAddFriend}
                  variant="primary"
                  loading={actionLoading}
                  disabled={actionLoading}
                  style={styles.actionBtn}
                  icon={<Ionicons name="person-add" size={18} color={Colors.background} />}
                />
              )}
              {relation === 'pending_outgoing' && (
                <AnimatedButton
                  label="Request Sent"
                  onPress={handleCancelRequest}
                  variant="ghost"
                  loading={actionLoading}
                  disabled={actionLoading}
                  style={styles.actionBtn}
                  icon={<Ionicons name="time-outline" size={18} color={Colors.primary} />}
                  accessibilityLabel="Friend request sent. Tap to cancel"
                />
              )}
              {relation === 'pending_incoming' && (
                <View style={styles.incomingRow}>
                  <AnimatedButton
                    label="Accept"
                    onPress={handleAccept}
                    variant="primary"
                    loading={actionLoading}
                    disabled={actionLoading}
                    style={styles.flex1}
                    icon={<Ionicons name="checkmark" size={18} color={Colors.background} />}
                  />
                  <AnimatedButton
                    label="Decline"
                    onPress={handleDecline}
                    variant="ghost"
                    disabled={actionLoading}
                    style={styles.flex1}
                  />
                </View>
              )}
            </View>
          )}
        </Animated.View>

        {/* Bio */}
        {!!profile.bio && (
          <AnimatedCard index={0} style={styles.cardSpacing}>
            <View style={styles.sectionHeader}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Bio</Text>
            </View>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </AnimatedCard>
        )}

        {/* Stats */}
        <AnimatedCard index={1} accentColor={Colors.gold}>
          <View style={styles.statsRow}>
            <StatBox label="Friends" value={friendCount} />
            <View style={styles.statDivider} />
            <StatBox label="Plans" value={planCount} />
          </View>
        </AnimatedCard>

        {/* Their public plans */}
        <View style={styles.plansSection}>
          <Text style={styles.sectionLabel}>Public Plans</Text>
          {theirPlans.length > 0 ? (
            theirPlans.map((plan, i) => (
              <PlanRow key={plan.id} plan={plan} index={i} onPress={openPlan} />
            ))
          ) : (
            <View style={styles.plansEmpty}>
              <Ionicons name="calendar-outline" size={28} color={Colors.textMuted} />
              <Text style={styles.plansEmptyText}>No public plans yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
const ProfileHeader = React.memo(function ProfileHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={24} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
});

const StatBox = React.memo(function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue} numberOfLines={1} allowFontScaling={false}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
});

const PlanRow = React.memo(function PlanRow({
  plan,
  index = 0,
  onPress,
}: {
  plan: PlanSummary;
  index?: number;
  onPress: (id: string) => void;
}) {
  const dateLabel = formatPlanDate(plan.date);
  const status = plan.status ?? 'draft';
  return (
    <TouchableOpacity
      style={[styles.planRow, index > 0 && styles.planRowGap]}
      onPress={() => onPress(plan.id)}
      activeOpacity={0.75}
      hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
      accessibilityRole="button"
      accessibilityLabel={`Open plan ${plan.title ?? 'untitled'}, status ${status}`}
    >
      <View style={styles.planRowAccent} />
      <View style={styles.planRowContent}>
        <Text style={styles.planRowTitle} numberOfLines={1}>
          {plan.title || 'Untitled plan'}
        </Text>
        {!!dateLabel && (
          <Text style={styles.planRowDate} allowFontScaling={false}>
            {dateLabel}
          </Text>
        )}
      </View>
      <View style={styles.planStatusPill}>
        <Text style={styles.planStatusText} numberOfLines={1}>
          {status}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} style={styles.planChevron} />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 44 },
  headerTitle: {
    fontSize: FontSize.lg,
    fontFamily: Fonts.heading,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    flex: 1,
    textAlign: 'center',
  },

  // ── Loading / not-found ─────────────────────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  notFoundText: {
    fontSize: FontSize.lg,
    fontFamily: Fonts.headingSemibold,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },

  content: { padding: Spacing.container, paddingBottom: Spacing.xxl },

  // ── Avatar + identity ───────────────────────────────────────────────────────
  avatarSection: { alignItems: 'center', paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.primaryGlow,
    ...Shadow.primaryStrong,
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 48 },
  avatarText: {
    fontSize: 40,
    lineHeight: 48,
    fontFamily: Fonts.headingBold,
    fontWeight: FontWeight.heavy,
    color: Colors.background,
  },
  displayName: {
    fontSize: FontSize.xxl,
    lineHeight: 38,
    fontFamily: Fonts.headingBold,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    textAlign: 'center',
    maxWidth: '100%',
  },
  usernameHandle: {
    fontSize: FontSize.md,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  metaGroup: { alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  metaText: {
    fontSize: FontSize.sm,
    fontFamily: Fonts.body,
    color: Colors.textMuted,
    flexShrink: 1,
  },

  // ── Relationship actions ────────────────────────────────────────────────────
  friendActions: { marginTop: Spacing.md, width: '100%', alignItems: 'stretch', paddingHorizontal: Spacing.xs },
  actionBtn: {},
  incomingRow: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  flex1: { flex: 1 },

  // ── Cards / sections ────────────────────────────────────────────────────────
  cardSpacing: { marginBottom: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.xs },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontFamily: Fonts.heading,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  bioText: {
    fontSize: FontSize.md,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 24,
  },

  // ── Stats ───────────────────────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: Spacing.xs, gap: 4 },
  statValue: {
    fontSize: FontSize.xl,
    lineHeight: 30,
    fontFamily: Fonts.headingBold,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: FontSize.xs,
    fontFamily: Fonts.bodySemibold,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  statDivider: { width: 1, height: 36, backgroundColor: Colors.borderStrong },

  // ── Plans ───────────────────────────────────────────────────────────────────
  plansSection: { marginTop: Spacing.md },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontFamily: Fonts.bodySemibold,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  planRowGap: { marginTop: Spacing.xs },
  planRowAccent: { width: 3, alignSelf: 'stretch', backgroundColor: Colors.primary },
  planRowContent: { flex: 1, paddingVertical: Spacing.sm, paddingLeft: Spacing.sm },
  planRowTitle: {
    fontSize: FontSize.md,
    fontFamily: Fonts.bodySemibold,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  planRowDate: {
    fontSize: FontSize.xs,
    fontFamily: Fonts.body,
    color: Colors.textMuted,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  planStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginLeft: Spacing.sm,
    backgroundColor: Colors.glassStrong,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  planStatusText: {
    fontSize: FontSize.xs,
    fontFamily: Fonts.bodySemibold,
    fontWeight: FontWeight.semibold,
    textTransform: 'capitalize',
    letterSpacing: 0.3,
    color: Colors.textSecondary,
  },
  planChevron: { marginHorizontal: Spacing.xs },

  // ── Plans empty state ───────────────────────────────────────────────────────
  plansEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  plansEmptyText: {
    fontSize: FontSize.sm,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textMuted,
  },
});
