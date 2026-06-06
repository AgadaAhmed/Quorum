import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, storage } from '../../lib/firebase';
import { useToast } from '../../components/Toast';
import ScreenWrapper from '../../components/ScreenWrapper';
import AnimatedButton from '../../components/AnimatedButton';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';

type UserProfile = {
  displayName: string;
  username?: string;
  usernameLower?: string;
  email: string;
  city?: string;
  country?: string;
  friends?: string[];
  bio?: string;
  avatarUrl?: string;
  emergencyContact?: { name: string; phone: string };
  planCount?: number;
  voteCount?: number;
  ratingAvg?: number;
};

type Plan = {
  id: string;
  title?: string;
  category?: string;
  status?: string;
  createdBy?: string;
  coverUrl?: string;
  location?: string;
  date?: { seconds: number } | null;
};

const DEFAULT_INTERESTS = ['Music', 'Food', 'Sports', 'Art', 'Gaming', 'Travel'];

/** Number of votes assumed to constitute "full consensus" per plan. */
const VOTES_PER_QUORUM = 3;

function getConsensusPercent(voteCount: number, planCount: number): number {
  if (planCount <= 0) return 0;
  return Math.min(
    Math.round((voteCount / Math.max(planCount * VOTES_PER_QUORUM, 1)) * 100),
    100
  );
}

const ProfileStatItem = React.memo(function ProfileStatItem({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <View style={profileStatStyles.badge} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={profileStatStyles.value}>{value}</Text>
      {sub ? <Text style={profileStatStyles.sub}>{sub}</Text> : null}
      <Text style={profileStatStyles.label}>{label}</Text>
    </View>
  );
});

const profileStatStyles = StyleSheet.create({
  badge: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm + 2 },
  value: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.text, letterSpacing: -0.5 },
  sub: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold },
  label: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 2,
  },
});

type Achievement = { icon: keyof typeof Ionicons.glyphMap; label: string; unlocked: boolean };

const PlanRow = React.memo(function PlanRow({
  plan,
  onPress,
}: {
  plan: Plan;
  onPress: (id: string) => void;
}) {
  const handlePress = useCallback(() => onPress(plan.id), [onPress, plan.id]);
  const dateLabel =
    plan.date?.seconds != null
      ? new Date(plan.date.seconds * 1000).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';
  const meta = [dateLabel, plan.location].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity
      style={styles.planRow}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Open plan ${plan.title || 'Untitled plan'}`}
    >
      <View style={styles.planRowThumb}>
        {plan.coverUrl ? (
          <Image source={{ uri: plan.coverUrl }} style={styles.planRowThumbImage} />
        ) : (
          <View style={styles.planRowThumbPlaceholder} />
        )}
      </View>
      <View style={styles.planRowInfo}>
        <Text style={styles.planRowTitle} numberOfLines={1}>
          {plan.title || 'Untitled plan'}
        </Text>
        {meta ? (
          <Text style={styles.planRowMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
});

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [planCount, setPlanCount] = useState(0);
  const [voteCount, setVoteCount] = useState(0);
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [myPlans, setMyPlans] = useState<Plan[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const { showToast } = useToast();
  const avatarScale = useRef(new Animated.Value(0)).current;
  const [uid, setUid] = useState(auth.currentUser?.uid || '');

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid || ''));
  }, []);

  const loadProfile = useCallback(async () => {
    if (!uid) return;
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const data = (snap.exists() ? snap.data() : {}) as UserProfile;
      setProfile(data);
      setBio(data.bio || '');
      setDisplayName(data.displayName || '');
      setUsername(data.username || '');
      setCity(data.city || '');
      setCountry(data.country || '');
      setEmergencyName(data.emergencyContact?.name || '');
      setEmergencyPhone(data.emergencyContact?.phone || '');
    } catch {
      showToast('Failed to load profile', 'error');
    }
  }, [uid, showToast]);

  const loadStats = useCallback(async () => {
    if (!uid) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'plans'), where('participants', 'array-contains', uid))
      );
      setPlanCount(snap.size);
      let votes = 0;
      snap.docs.forEach((d) => {
        if ((d.data().votes || []).includes(uid)) votes++;
      });
      setVoteCount(votes);
    } catch {
      // Stats are non-critical; fail silently rather than blocking the screen.
    }
  }, [uid]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadProfile(), loadStats()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile, loadStats]);

  useEffect(() => {
    if (!uid) return;
    loadProfile();
    loadStats();

    Animated.spring(avatarScale, {
      toValue: 1,
      tension: 60,
      friction: 7,
      delay: 200,
      useNativeDriver: true,
    }).start();
  }, [uid, loadProfile, loadStats, avatarScale]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'plans'),
      where('participants', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMyPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Plan));
    });
    return unsub;
  }, [uid]);

  const handleSave = useCallback(async () => {
    if (!uid || saving) return;
    setUsernameError('');
    if (!displayName.trim()) {
      showToast('Display name cannot be empty', 'error');
      return;
    }
    const trimmedUsername = username.trim();
    if (trimmedUsername !== profile?.username) {
      if (!trimmedUsername) { setUsernameError('Username cannot be empty'); return; }
      if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) { setUsernameError('Only letters, numbers, and underscores'); return; }
      const taken = await getDocs(query(collection(db, 'users'), where('usernameLower', '==', trimmedUsername.toLowerCase())));
      if (!taken.empty) {
        const base = trimmedUsername.replace(/\d+$/, '');
        const suggestions = [base + '1', base + '2', base + '_' + Math.floor(Math.random() * 99 + 1)];
        setUsernameError(`Taken. Try: ${suggestions.join(', ')}`);
        return;
      }
    }
    setSaving(true);
    const trimmedName = displayName.trim();
    const trimmedCity = city.trim();
    const trimmedCountry = country.trim();
    const updates: Partial<UserProfile> = {
      displayName: trimmedName,
      bio,
      city: trimmedCity,
      country: trimmedCountry,
      emergencyContact: { name: emergencyName.trim(), phone: emergencyPhone.trim() },
    };
    if (trimmedUsername !== profile?.username && trimmedUsername) {
      updates.username = trimmedUsername;
      updates.usernameLower = trimmedUsername.toLowerCase();
    }
    try {
      await updateDoc(doc(db, 'users', uid), updates);
      setProfile((p) =>
        p
          ? {
              ...p,
              displayName: trimmedName,
              bio,
              username: trimmedUsername || p.username,
              city: trimmedCity,
              country: trimmedCountry,
              emergencyContact: { name: emergencyName.trim(), phone: emergencyPhone.trim() },
            }
          : p
      );
      setEditing(false);
      showToast('Profile saved!');
    } catch {
      showToast('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    uid,
    saving,
    displayName,
    username,
    bio,
    city,
    country,
    emergencyName,
    emergencyPhone,
    profile?.username,
    showToast,
  ]);

  const handleAvatarPick = useCallback(async () => {
    if (!uid || uploadingAvatar) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast('Photo permission is required', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images' as ImagePicker.MediaType],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingAvatar(true);
    try {
      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `avatars/${uid}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'users', uid), { avatarUrl: url });
      setProfile((p) => (p ? { ...p, avatarUrl: url } : p));
      showToast('Avatar updated!');
    } catch {
      showToast('Failed to upload photo', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  }, [uid, uploadingAvatar, showToast]);

  const handleSignOut = useCallback(async () => {
    try {
      await auth.signOut();
    } catch {
      showToast('Failed to sign out', 'error');
    }
  }, [showToast]);

  const openEdit = useCallback(() => setEditing(true), []);
  const closeEdit = useCallback(() => setEditing(false), []);
  const goToSettings = useCallback(() => router.push('/settings' as any), [router]);
  const goToFriends = useCallback(() => router.push('/social' as any), [router]);
  const openPlan = useCallback(
    (id: string) => router.push({ pathname: '/plan-detail', params: { id } } as any),
    [router]
  );

  const initials = useMemo(
    () => (profile?.displayName || auth.currentUser?.email || 'U').trim().charAt(0).toUpperCase() || 'U',
    [profile?.displayName]
  );

  const hasLocation = !!(profile?.city || profile?.country);
  const locationLabel = useMemo(
    () => [profile?.city, profile?.country].filter(Boolean).join(', '),
    [profile?.city, profile?.country]
  );

  const consensusPct = useMemo(
    () => getConsensusPercent(voteCount, planCount),
    [voteCount, planCount]
  );

  const hostedCount = useMemo(
    () => myPlans.filter((p) => p.createdBy === uid).length,
    [myPlans, uid]
  );
  const confirmedCount = useMemo(
    () => myPlans.filter((p) => p.status === 'confirmed').length,
    [myPlans]
  );
  const hasConfirmed = confirmedCount > 0;
  const friendCount = profile?.friends?.length ?? 0;

  const displayInterests = useMemo(() => {
    const categoryMap = new Map<string, number>();
    myPlans.forEach((p) => {
      if (p.category) categoryMap.set(p.category, (categoryMap.get(p.category) || 0) + 1);
    });
    const interests = [...categoryMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);
    return (interests.length > 0 ? interests : DEFAULT_INTERESTS).slice(0, 8);
  }, [myPlans]);

  const achievements = useMemo<Achievement[]>(
    () => [
      { icon: 'trophy-outline', label: 'Quorum King', unlocked: voteCount >= 10 },
      { icon: 'checkmark-circle-outline', label: 'On Target', unlocked: planCount >= 3 },
      { icon: 'people-outline', label: 'Connector', unlocked: friendCount >= 5 },
      { icon: 'flash-outline', label: 'Fast Mover', unlocked: hasConfirmed },
    ],
    [voteCount, planCount, friendCount, hasConfirmed]
  );

  const loading = !profile;

  return (
    <ScreenWrapper>
      {/* App Header */}
      <View style={styles.appHeader}>
        <Text style={styles.appHeaderTitle}>QUORUM</Text>
        <TouchableOpacity
          style={styles.headerIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Search"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="search-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* ── Stats Grid ── */}
        <View style={styles.statsContainer}>
          <ProfileStatItem label="Plans" value={planCount} />
          <View style={styles.statDivider} />
          <ProfileStatItem label="Votes" value={voteCount} />
          <View style={styles.statDivider} />
          <ProfileStatItem label="Network" value={friendCount} />
        </View>
        <View style={styles.statsContainerNoTop}>
          <ProfileStatItem label="Quorum Rate" value={planCount > 0 ? `${consensusPct}%` : '—'} />
          <View style={styles.statDivider} />
          <ProfileStatItem label="Hosted" value={hostedCount} />
          <View style={styles.statDivider} />
          <ProfileStatItem label="Confirmed" value={confirmedCount} />
        </View>

        {/* ── Hero Banner ── */}
        <View style={styles.heroContainer}>
          {/* Avatar */}
          <TouchableOpacity
            onPress={handleAvatarPick}
            disabled={uploadingAvatar}
            style={styles.avatarWrapper}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            accessibilityState={{ disabled: uploadingAvatar, busy: uploadingAvatar }}
          >
            <Animated.View style={[styles.avatarCircle, { transform: [{ scale: avatarScale }] }]}>
              {profile?.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{initials}</Text>
                </View>
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <Ionicons name="cloud-upload-outline" size={18} color={Colors.background} />
                </View>
              )}
            </Animated.View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={10} color={Colors.background} />
            </View>
          </TouchableOpacity>

          {/* Name, handle, bio, consensus — beside avatar */}
          <View style={styles.heroInfo}>
            <Text style={styles.heroName} numberOfLines={1}>
              {profile?.displayName || (loading ? 'Loading…' : 'Unnamed')}
            </Text>
            {profile?.username ? (
              <Text style={styles.heroHandle}>@{profile.username}</Text>
            ) : null}
            {profile?.bio ? (
              <Text style={styles.heroBio} numberOfLines={2}>
                {profile.bio}
              </Text>
            ) : null}
            {hasLocation ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.locationText} numberOfLines={1}>
                  {locationLabel}
                </Text>
              </View>
            ) : null}
            {/* Consensus bar */}
            <View
              style={styles.consensusRow}
              accessible
              accessibilityLabel={`${consensusPct} percent consensus`}
            >
              <Text style={styles.consensusLabel}>{consensusPct}% Consensus</Text>
              <View style={styles.consensusTrack}>
                <View style={[styles.consensusFill, { width: `${consensusPct}%` }]} />
              </View>
            </View>
          </View>
        </View>

        {/* ── Action Buttons Row ── */}
        <View style={styles.actionsRow}>
          <AnimatedButton
            label="Edit Profile"
            onPress={openEdit}
            variant="secondary"
            size="sm"
            style={styles.actionBtn}
          />
          <AnimatedButton
            label="Settings"
            onPress={goToSettings}
            variant="ghost"
            size="sm"
            style={styles.actionBtn}
          />
          <AnimatedButton
            label="Friends"
            onPress={goToFriends}
            variant="ghost"
            size="sm"
            style={styles.actionBtn}
          />
        </View>

        {/* ── Social Interests ── */}
        <View style={styles.interestsSection}>
          <Text style={styles.sectionLabel}>Social Interests</Text>
          <View style={styles.interestsTags}>
            {displayInterests.map((tag) => (
              <View key={tag} style={styles.interestTag}>
                <Text style={styles.interestTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Achievements ── */}
        <View style={styles.achievementsSection}>
          <Text style={styles.sectionLabel}>Achievements</Text>
          <View style={styles.achievementsRow}>
            {achievements.map((a) => (
              <View
                key={a.label}
                style={[styles.achievementBadge, !a.unlocked && styles.achievementLocked]}
                accessible
                accessibilityLabel={`${a.label}, ${a.unlocked ? 'unlocked' : 'locked'}`}
              >
                <Ionicons
                  name={a.icon}
                  size={20}
                  color={a.unlocked ? Colors.background : Colors.textDisabled}
                />
                <Text style={[styles.achievementLabel, !a.unlocked && styles.achievementLabelLocked]}>
                  {a.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── My Plans ── */}
        {myPlans.length > 0 && (
          <View style={styles.plansSection}>
            <Text style={styles.sectionLabel}>Active Plans</Text>
            {myPlans.map((plan) => (
              <PlanRow key={plan.id} plan={plan} onPress={openPlan} />
            ))}
          </View>
        )}

        {/* Recent Posts */}
        <View style={styles.recentPostsSection}>
          <Text style={styles.sectionLabel}>Recent Posts</Text>
          <Text style={styles.recentPostsEmpty}>
            Your moments from plans will appear here.
          </Text>
        </View>

        {/* ── Emergency Contact Card ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.success} />
            <Text style={styles.cardTitle}>Emergency Contact</Text>
          </View>
          {emergencyName || emergencyPhone ? (
            <View style={styles.infoGroup}>
              {emergencyName ? (
                <View style={styles.infoRow}>
                  <Ionicons name="person-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.infoText}>{emergencyName}</Text>
                </View>
              ) : null}
              {emergencyPhone ? (
                <View style={styles.infoRow}>
                  <Ionicons name="call-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.infoText}>{emergencyPhone}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.emptyText}>No emergency contact set.</Text>
          )}
        </View>

        {/* ── Sign Out ── */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Ionicons name="log-out-outline" size={16} color={Colors.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Edit Modal ── */}
      <Modal visible={editing} animationType="slide" transparent onRequestClose={closeEdit}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity
                onPress={closeEdit}
                style={styles.modalClose}
                accessibilityRole="button"
                accessibilityLabel="Close edit profile"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Display Name */}
              <Text style={styles.fieldLabel}>Display Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your display name"
                placeholderTextColor={Colors.textMuted}
              />

              {/* Username */}
              <Text style={styles.fieldLabel}>Username</Text>
              <View style={styles.usernameRow}>
                <Text style={styles.usernameAt}>@</Text>
                <TextInput
                  style={[styles.fieldInput, styles.usernameInput]}
                  value={username}
                  onChangeText={(t) => { setUsername(t.replace(/[^a-zA-Z0-9_]/g, '')); setUsernameError(''); }}
                  placeholder="username"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {usernameError ? <Text style={styles.fieldError}>{usernameError}</Text> : null}

              {/* Bio */}
              <Text style={styles.fieldLabel}>Bio</Text>
              <TextInput
                style={[styles.fieldInput, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell friends about yourself..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
              <Text style={styles.charCount}>{bio.length}/200</Text>

              {/* Location */}
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput
                style={styles.fieldInput}
                value={city}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Country</Text>
              <TextInput
                style={styles.fieldInput}
                value={country}
                onChangeText={setCountry}
                placeholder="Country"
                placeholderTextColor={Colors.textMuted}
              />

              {/* Emergency Contact */}
              <View style={styles.sectionDivider} />
              <View style={styles.cardHeader}>
                <Ionicons name="shield-checkmark-outline" size={14} color={Colors.success} />
                <Text style={styles.cardHeaderLabel}>Emergency Contact</Text>
              </View>

              <Text style={styles.fieldLabel}>Contact Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={emergencyName}
                onChangeText={setEmergencyName}
                placeholder="e.g. Mom, John"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                style={styles.fieldInput}
                value={emergencyPhone}
                onChangeText={setEmergencyPhone}
                placeholder="Phone number"
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
              />

              <AnimatedButton
                label="Save Changes"
                onPress={handleSave}
                variant="primary"
                loading={saving}
                disabled={saving}
                style={styles.saveBtn}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 100,
  },

  // Hero
  heroContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.container,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
    gap: Spacing.sm,
  },
  avatarWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.primary,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  heroHandle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
  heroBio: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
  },
  locationText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.container,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  statsContainerNoTop: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.container,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.container,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionBtn: {
    flex: 1,
  },

  // Card
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  cardHeaderLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  infoGroup: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.errorDim,
    backgroundColor: 'transparent',
  },
  signOutText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },

  // Edit Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },
  modalSheet: {
    backgroundColor: Colors.surfaceRaised,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
  },
  modalClose: {
    padding: 6,
  },

  // Form fields
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  fieldInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm + 2,
    color: Colors.text,
    fontSize: FontSize.md,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  usernameAt: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.md,
    marginRight: 4,
    paddingBottom: 2,
  },
  usernameInput: {
    flex: 1,
  },
  fieldError: {
    fontSize: FontSize.xs,
    color: Colors.error,
    marginTop: 4,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  saveBtn: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },

  // App Header
  appHeader: {
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
  appHeaderTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: 3,
  },
  headerIconBtn: {
    padding: 6,
  },

  // Consensus bar
  consensusRow: {
    width: '100%',
    marginTop: Spacing.sm,
    gap: 6,
  },
  consensusLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  consensusTrack: {
    height: 6,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 0,
    width: '100%',
    overflow: 'hidden',
  },
  consensusFill: {
    height: 6,
    backgroundColor: Colors.primary,
    borderRadius: 0,
  },

  // My Plans section
  plansSection: { marginBottom: Spacing.lg },
  sectionLabel: {
    fontSize: 11,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.container,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
    backgroundColor: Colors.backgroundAlt,
  },
  planRowThumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    overflow: 'hidden',
    flexShrink: 0,
  },
  planRowThumbImage: {
    width: '100%',
    height: '100%',
  },
  planRowThumbPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surfaceRaised,
  },
  planRowInfo: {
    flex: 1,
  },
  planRowTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  planRowMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 3,
  },

  // Social Interests
  interestsSection: {
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  interestsTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs + 4,
    marginTop: Spacing.sm,
  },
  interestTag: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  interestTagText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    letterSpacing: 0.3,
  },

  // Achievements
  achievementsSection: {
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  achievementsRow: {
    flexDirection: 'row',
    gap: Spacing.xs + 6,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  achievementBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
    minWidth: 80,
    minHeight: 44,
  },
  achievementLocked: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  achievementLabel: {
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    color: Colors.background,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: 4,
  },
  achievementLabelLocked: {
    color: Colors.textDisabled,
  },

  // Recent Posts
  recentPostsSection: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.container,
    paddingBottom: Spacing.lg,
  },
  recentPostsEmpty: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});
