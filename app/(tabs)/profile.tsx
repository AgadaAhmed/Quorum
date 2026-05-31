import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadow } from '../../lib/theme';

type UserProfile = {
  displayName: string;
  username?: string;
  email: string;
  city?: string;
  country?: string;
  friends: string[];
  bio?: string;
  avatarUrl?: string;
  emergencyContact?: { name: string; phone: string };
  planCount?: number;
  voteCount?: number;
  ratingAvg?: number;
};

function ProfileStatItem({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <View style={profileStatStyles.badge}>
      <Text style={profileStatStyles.value}>{value}</Text>
      {sub ? <Text style={profileStatStyles.sub}>{sub}</Text> : null}
      <Text style={profileStatStyles.label}>{label}</Text>
    </View>
  );
}

const profileStatStyles = StyleSheet.create({
  badge: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  value: { fontSize: 22, fontWeight: '800', color: '#0f0f0f', letterSpacing: -0.5 },
  sub: { fontSize: 10, color: '#5c5959', fontWeight: '600' },
  label: { fontSize: 9, color: '#5c5959', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 2 },
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
  const [myPlans, setMyPlans] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const { showToast } = useToast();
  const avatarScale = useRef(new Animated.Value(0)).current;
  const [uid, setUid] = useState(auth.currentUser?.uid || '');

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid || ''));
  }, []);

  const loadProfile = useCallback(async () => {
    if (!uid) return;
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.data() as UserProfile;
    setProfile(data);
    setBio(data?.bio || '');
    setDisplayName(data?.displayName || '');
    setUsername(data?.username || '');
    setCity(data?.city || '');
    setCountry(data?.country || '');
    setEmergencyName(data?.emergencyContact?.name || '');
    setEmergencyPhone(data?.emergencyContact?.phone || '');
  }, [uid]);

  const loadStats = useCallback(async () => {
    if (!uid) return;
    const snap = await getDocs(query(collection(db, 'plans'), where('participants', 'array-contains', uid)));
    setPlanCount(snap.size);
    let votes = 0;
    snap.docs.forEach((d) => {
      if ((d.data().votes || []).includes(uid)) votes++;
    });
    setVoteCount(votes);
  }, [uid]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadStats()]);
    setRefreshing(false);
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
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'plans'),
      where('participants', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMyPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  const handleSave = async () => {
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
    const updates: any = {
      displayName,
      bio,
      city: city.trim(),
      country: country.trim(),
      emergencyContact: { name: emergencyName.trim(), phone: emergencyPhone.trim() },
    };
    if (trimmedUsername !== profile?.username && trimmedUsername) {
      updates.username = trimmedUsername;
      updates.usernameLower = trimmedUsername.toLowerCase();
    }
    try {
      await updateDoc(doc(db, 'users', uid), updates);
      setProfile((p) =>
        p ? { ...p, displayName, bio, username: trimmedUsername, city: city.trim(), country: country.trim() } : p
      );
      setEditing(false);
      showToast('Profile saved!');
    } catch {
      showToast('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarPick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
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
  };

  const handleSignOut = async () => {
    await auth.signOut();
  };

  const initials = (profile?.displayName || auth.currentUser?.email || 'U')[0].toUpperCase();

  const hasLocation = !!(profile?.city || profile?.country);
  const ratingAvg = profile?.ratingAvg;

  return (
    <ScreenWrapper>
      {/* App Header */}
      <View style={styles.appHeader}>
        <Text style={styles.appHeaderTitle}>QUORUM</Text>
        <Ionicons name="search-outline" size={22} color={Colors.text} />
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
          <ProfileStatItem label="Network" value={profile?.friends?.length ?? 0} />
        </View>
        <View style={[styles.statsContainer, { borderTopWidth: 0 }]}>
          <ProfileStatItem label="Quorum Rate" value={planCount > 0 ? `${Math.round((voteCount / Math.max(planCount * 3, 1)) * 100)}%` : '—'} />
          <View style={styles.statDivider} />
          <ProfileStatItem label="Hosted" value={myPlans.filter((p: any) => p.createdBy === uid).length} />
          <View style={styles.statDivider} />
          <ProfileStatItem label="Confirmed" value={myPlans.filter((p: any) => p.status === 'confirmed').length} />
        </View>

        {/* ── Hero Banner ── */}
        <View style={styles.heroContainer}>
          {/* Avatar */}
          <TouchableOpacity onPress={handleAvatarPick} disabled={uploadingAvatar} style={styles.avatarWrapper}>
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
                  <Ionicons name="cloud-upload-outline" size={18} color={Colors.text} />
                </View>
              )}
            </Animated.View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={10} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Name, handle, bio, consensus — beside avatar */}
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{profile?.displayName || 'Loading...'}</Text>
            {profile?.username ? (
              <Text style={styles.heroHandle}>@{profile.username}</Text>
            ) : null}
            {profile?.bio ? (
              <Text style={styles.heroBio} numberOfLines={2}>{profile.bio}</Text>
            ) : null}
            {hasLocation ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.locationText}>
                  {[profile?.city, profile?.country].filter(Boolean).join(', ')}
                </Text>
              </View>
            ) : null}
            {/* Consensus bar */}
            <View style={styles.consensusRow}>
              <Text style={styles.consensusLabel}>
                {planCount > 0 ? Math.round((voteCount / Math.max(planCount * 3, 1)) * 100) : 0}% Consensus
              </Text>
              <View style={styles.consensusTrack}>
                <View style={[styles.consensusFill, {
                  width: `${Math.min(planCount > 0 ? Math.round((voteCount / Math.max(planCount * 3, 1)) * 100) : 0, 100)}%`
                }]} />
              </View>
            </View>
          </View>
        </View>

        {/* ── Action Buttons Row ── */}
        <View style={styles.actionsRow}>
          <AnimatedButton
            label="Edit Profile"
            onPress={() => setEditing(true)}
            variant="secondary"
            size="sm"
            style={styles.actionBtn}
          />
          <AnimatedButton
            label="Settings"
            onPress={() => router.push('/settings' as any)}
            variant="ghost"
            size="sm"
            style={styles.actionBtn}
          />
          <AnimatedButton
            label="Friends"
            onPress={() => router.push('/social' as any)}
            variant="ghost"
            size="sm"
            style={styles.actionBtn}
          />
        </View>

        {/* ── Social Interests ── */}
        {(() => {
          // Derive interests from plan categories
          const categoryMap: Record<string, number> = {};
          myPlans.forEach((p: any) => {
            if (p.category) categoryMap[p.category] = (categoryMap[p.category] || 0) + 1;
          });
          const interests = Object.entries(categoryMap)
            .sort((a, b) => b[1] - a[1])
            .map(([cat]) => cat);
          const DEFAULT_INTERESTS = ['Music', 'Food', 'Sports', 'Art', 'Gaming', 'Travel'];
          const displayInterests = interests.length > 0 ? interests : DEFAULT_INTERESTS;
          return (
            <View style={styles.interestsSection}>
              <Text style={styles.sectionLabel}>Social Interests</Text>
              <View style={styles.interestsTags}>
                {displayInterests.slice(0, 8).map((tag) => (
                  <View key={tag} style={styles.interestTag}>
                    <Text style={styles.interestTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* ── Achievements ── */}
        <View style={styles.achievementsSection}>
          <Text style={styles.sectionLabel}>Achievements</Text>
          <View style={styles.achievementsRow}>
            {[
              { icon: 'trophy-outline', label: 'Quorum King', unlocked: voteCount >= 10 },
              { icon: 'checkmark-circle-outline', label: 'On Target', unlocked: planCount >= 3 },
              { icon: 'people-outline', label: 'Connector', unlocked: (profile?.friends?.length ?? 0) >= 5 },
              { icon: 'flash-outline', label: 'Fast Mover', unlocked: myPlans.some((p: any) => p.status === 'confirmed') },
            ].map((a) => (
              <View key={a.label} style={[styles.achievementBadge, !a.unlocked && styles.achievementLocked]}>
                <Ionicons name={a.icon as any} size={20} color={a.unlocked ? '#ffffff' : 'rgba(0,0,0,0.25)'} />
                <Text style={[styles.achievementLabel, !a.unlocked && styles.achievementLabelLocked]}>{a.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── My Plans ── */}
        {myPlans.length > 0 && (
          <View style={styles.plansSection}>
            <Text style={styles.sectionLabel}>Active Plans</Text>
            {myPlans.map((plan: any, index: number) => (
              <TouchableOpacity
                key={plan.id}
                style={styles.planRow}
                onPress={() => router.push({ pathname: '/plan-detail', params: { id: plan.id } } as any)}
                activeOpacity={0.7}
              >
                <View style={styles.planRowThumb}>
                  {plan.coverUrl ? (
                    <Image source={{ uri: plan.coverUrl }} style={styles.planRowThumbImage} />
                  ) : (
                    <View style={styles.planRowThumbPlaceholder} />
                  )}
                </View>
                <View style={styles.planRowInfo}>
                  <Text style={styles.planRowTitle} numberOfLines={1}>{plan.title}</Text>
                  <Text style={styles.planRowMeta} numberOfLines={1}>
                    {plan.date ? new Date(plan.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}{plan.location ? ` · ${plan.location}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
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
            <View style={{ gap: 6 }}>
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
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={16} color={Colors.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Edit Modal ── */}
      <Modal visible={editing} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditing(false)} style={styles.modalClose}>
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
                <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>Emergency Contact</Text>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Contact Name</Text>
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
                style={{ marginTop: Spacing.lg, marginBottom: Spacing.xl }}
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
    backgroundColor: 'rgba(0,0,0,0.55)',
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
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
    maxWidth: 280,
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
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 3,
  },

  // Consensus bar
  consensusRow: {
    width: '100%',
    marginTop: Spacing.sm,
    gap: 6,
  },
  consensusLabel: {
    fontSize: 12,
    fontWeight: '700',
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
    fontWeight: '800',
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
    fontWeight: '700',
    color: Colors.text,
  },
  planRowMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 3,
  },

  // Social Interests
  interestsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  interestsTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  interestTag: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#0f0f0f',
    backgroundColor: '#ffffff',
  },
  interestTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f0f0f',
    letterSpacing: 0.3,
  },

  // Achievements
  achievementsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  achievementsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  achievementBadge: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#0f0f0f',
    backgroundColor: '#0f0f0f',
    minWidth: 80,
  },
  achievementLocked: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(0,0,0,0.15)',
  },
  achievementIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  achievementLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  achievementLabelLocked: {
    color: 'rgba(0,0,0,0.3)',
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
