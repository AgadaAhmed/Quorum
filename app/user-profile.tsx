import React, { useEffect, useRef, useState } from 'react';
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
import { auth, db } from '../lib/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import AnimatedCard from '../components/AnimatedCard';
import AnimatedButton from '../components/AnimatedButton';
import { SkeletonProfile } from '../components/SkeletonLoader';
import { useToast } from '../components/Toast';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

type Profile = {
  displayName: string;
  username?: string;
  bio?: string;
  city?: string;
  country?: string;
  friends?: string[];
  avatarUrl?: string;
};

type RelationStatus = 'self' | 'friend' | 'pending_incoming' | 'pending_outgoing' | 'none';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const uid = auth.currentUser?.uid || '';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [planCount, setPlanCount] = useState(0);
  const [relation, setRelation] = useState<RelationStatus>('none');
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [mutualCount, setMutualCount] = useState(0);
  const [theirPlans, setTheirPlans] = useState<any[]>([]);

  const avatarScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!userId) return;
    if (userId === uid) { setRelation('self'); }

    Promise.all([
      getDoc(doc(db, 'users', userId)),
      getDocs(query(collection(db, 'plans'), where('participants', 'array-contains', userId))),
      getDoc(doc(db, 'users', uid)),
    ]).then(([profileSnap, plansSnap, mySnap]) => {
      if (profileSnap.exists()) setProfile(profileSnap.data() as Profile);
      setPlanCount(plansSnap.size);

      const myData = mySnap.data();
      const myFriends: string[] = myData?.friends || [];
      const myIncoming: any[] = myData?.friendRequests || [];
      setMyRequests(myIncoming);

      // Compute mutual friends
      const profileData = profileSnap.data() as Profile;
      const theirFriends: string[] = profileData?.friends ?? [];
      setMutualCount(myFriends.filter(id => theirFriends.includes(id)).length);

      if (userId === uid) {
        setRelation('self');
      } else if (myFriends.includes(userId)) {
        setRelation('friend');
      } else if (myIncoming.some((r: any) => r.fromId === userId)) {
        setRelation('pending_incoming');
      } else {
        // Check if we sent them a request
        getDoc(doc(db, 'users', userId)).then((theirSnap) => {
          const theirRequests: any[] = theirSnap.data()?.friendRequests || [];
          if (theirRequests.some((r: any) => r.fromId === uid)) {
            setRelation('pending_outgoing');
          }
        });
      }

      setLoading(false);
      Animated.parallel([
        Animated.spring(avatarScale, { toValue: 1, tension: 60, friction: 7, delay: 100, useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, duration: 400, delay: 150, useNativeDriver: true }),
      ]).start();
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'plans'),
      where('createdBy', '==', userId),
      where('isPublic', '==', true),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    const unsub = onSnapshot(q, snap => {
      setTheirPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [userId]);

  const handleAddFriend = async () => {
    if (!userId || actionLoading) return;
    setActionLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const mySnap = await getDoc(doc(db, 'users', uid));
      const myName = mySnap.data()?.displayName || 'Someone';
      await updateDoc(doc(db, 'users', userId), {
        friendRequests: arrayUnion({ fromId: uid, fromName: myName }),
      });
      setRelation('pending_outgoing');
      showToast(`Request sent to ${profile?.displayName}!`);
    } catch {
      showToast('Failed to send request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnfriend = async () => {
    if (!userId || actionLoading) return;
    setActionLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await updateDoc(doc(db, 'users', uid), { friends: arrayRemove(userId) });
      await updateDoc(doc(db, 'users', userId), { friends: arrayRemove(uid) });
      setRelation('none');
      showToast('Removed from friends');
    } catch {
      showToast('Failed to unfriend', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!userId || actionLoading) return;
    setActionLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const filtered = myRequests.filter((r: any) => r.fromId !== userId);
      await updateDoc(doc(db, 'users', uid), {
        friends: arrayUnion(userId),
        friendRequests: filtered,
      });
      await updateDoc(doc(db, 'users', userId), { friends: arrayUnion(uid) });
      setRelation('friend');
      setMyRequests(filtered);
      showToast(`You and ${profile?.displayName} are now friends!`);
    } catch {
      showToast('Failed to accept request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!userId || actionLoading) return;
    setActionLoading(true);
    try {
      const filtered = myRequests.filter((r: any) => r.fromId !== userId);
      await updateDoc(doc(db, 'users', uid), { friendRequests: filtered });
      setRelation('none');
      setMyRequests(filtered);
      showToast('Request declined');
    } catch {
      showToast('Failed to decline request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!userId || actionLoading) return;
    setActionLoading(true);
    try {
      const theirSnap = await getDoc(doc(db, 'users', userId));
      const filtered = (theirSnap.data()?.friendRequests || []).filter((r: any) => r.fromId !== uid);
      await updateDoc(doc(db, 'users', userId), { friendRequests: filtered });
      setRelation('none');
      showToast('Request cancelled');
    } catch {
      showToast('Failed to cancel request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const initials = (profile?.displayName || 'U')[0].toUpperCase();
  const friendCount = profile?.friends?.length || 0;

  const headerTitle = profile?.username
    ? `@${profile.username}`
    : profile?.displayName || 'Profile';

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <SkeletonProfile />
      </ScreenWrapper>
    );
  }

  if (!profile) {
    return (
      <ScreenWrapper>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="person-circle-outline" size={72} color={Colors.textMuted} />
          <Text style={styles.notFoundText}>User not found</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar + identity */}
        <Animated.View style={[styles.avatarSection, { opacity: contentOpacity }]}>
          <Animated.View style={[styles.avatarCircle, { transform: [{ scale: avatarScale }] }]}>
            <Text style={styles.avatarText}>{initials}</Text>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={[styles.avatarImage, StyleSheet.absoluteFillObject]} />
            ) : null}
          </Animated.View>

          <Text style={styles.displayName}>{profile.displayName}</Text>
          {profile.username && (
            <Text style={styles.usernameHandle}>@{profile.username}</Text>
          )}
          {(profile.city || profile.country) && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.locationText}>
                {[profile.city, profile.country].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}

          {mutualCount > 0 && (
            <View style={styles.mutualRow}>
              <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.mutualText}>{mutualCount} mutual friend{mutualCount !== 1 ? 's' : ''}</Text>
            </View>
          )}

          {/* Relationship actions */}
          {relation !== 'self' && (
            <View style={styles.friendActions}>
              {relation === 'friend' && (
                <AnimatedButton
                  label="Connected"
                  onPress={handleUnfriend}
                  variant="secondary"
                  loading={actionLoading}
                  disabled={actionLoading}
                  style={styles.actionBtn}
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
                />
              )}
              {relation === 'pending_outgoing' && (
                <AnimatedButton
                  label="Request Sent — Cancel"
                  onPress={handleCancelRequest}
                  variant="ghost"
                  loading={actionLoading}
                  disabled={actionLoading}
                  style={styles.actionBtn}
                />
              )}
              {relation === 'pending_incoming' && (
                <View style={styles.incomingRow}>
                  <AnimatedButton
                    label="Accept Request"
                    onPress={handleAccept}
                    variant="primary"
                    loading={actionLoading}
                    disabled={actionLoading}
                    style={{ flex: 1 }}
                  />
                  <AnimatedButton
                    label="Decline"
                    onPress={handleDecline}
                    variant="ghost"
                    disabled={actionLoading}
                    style={{ paddingHorizontal: 16 }}
                  />
                </View>
              )}
            </View>
          )}
        </Animated.View>

        {/* Bio */}
        {profile.bio ? (
          <AnimatedCard index={0} style={{ marginBottom: Spacing.md }}>
            <View style={styles.sectionHeader}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.sectionTitle}>Bio</Text>
            </View>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </AnimatedCard>
        ) : null}

        {/* Stats */}
        <AnimatedCard index={1} accentColor={Colors.gold}>
          <View style={styles.statsRow}>
            <StatBox label="Friends" value={String(friendCount)} />
            <View style={styles.statDivider} />
            <StatBox label="Plans" value={String(planCount)} />
          </View>
        </AnimatedCard>

        {/* Their public plans */}
        {theirPlans.length > 0 && (
          <View style={styles.plansSection}>
            <Text style={styles.sectionLabel}>Plans</Text>
            {theirPlans.map((plan) => {
              const statusColor =
                plan.status === 'confirmed' ? Colors.success :
                plan.status === 'archived' ? Colors.textMuted :
                Colors.primary;
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={styles.planRow}
                  onPress={() => router.push({ pathname: '/plan-detail', params: { id: plan.id } } as any)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.planRowAccent, { backgroundColor: statusColor }]} />
                  <View style={styles.planRowContent}>
                    <Text style={styles.planRowTitle} numberOfLines={1}>{plan.title}</Text>
                    {plan.date && (
                      <Text style={styles.planRowDate}>
                        {new Date(plan.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.planStatusPill, { backgroundColor: statusColor + '22' }]}>
                    <Text style={[styles.planStatusText, { color: statusColor }]}>{plan.status}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, flex: 1, textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: FontSize.lg, color: Colors.textSecondary, fontWeight: '600' },
  content: { padding: Spacing.md, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 6, marginBottom: Spacing.md },
  avatarCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8, overflow: 'hidden',
    borderWidth: 3, borderColor: Colors.primaryGlow,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 14, elevation: 10,
  },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  avatarText: { fontSize: 38, fontWeight: '800', color: Colors.text },
  displayName: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text },
  usernameHandle: { fontSize: FontSize.md, color: Colors.primary, fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locationText: { fontSize: FontSize.sm, color: Colors.textMuted },
  friendActions: { marginTop: Spacing.md, width: '100%', alignItems: 'center' },
  actionBtn: { paddingHorizontal: 32 },
  incomingRow: { flexDirection: 'row', gap: 10, width: '100%' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  bioText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  statValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 44, backgroundColor: Colors.border },
  mutualRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, marginBottom: 4 },
  mutualText: { fontSize: FontSize.sm, color: Colors.textMuted },
  plansSection: { paddingHorizontal: Spacing.md, marginTop: Spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1.5 },
  planRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md, marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  planRowAccent: { width: 3, alignSelf: 'stretch' },
  planRowContent: { flex: 1, paddingVertical: 12, paddingLeft: 12 },
  planRowTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  planRowDate: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  planStatusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, marginRight: 12 },
  planStatusText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'capitalize' },
});
