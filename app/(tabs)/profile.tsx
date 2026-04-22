import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

function StatChip({ label, value, gold }: { label: string; value: any; gold?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: FontSize.xl, fontWeight: FontWeight.black, color: gold ? Colors.gold : Colors.text }}>
        {value}
      </Text>
      <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium }}>
        {label}
      </Text>
    </View>
  );
}

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

  const { showToast } = useToast();
  const avatarScale = useRef(new Animated.Value(0)).current;
  const uid = auth.currentUser?.uid || '';

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      const data = snap.data() as UserProfile;
      setProfile(data);
      setBio(data?.bio || '');
      setDisplayName(data?.displayName || '');
      setUsername(data?.username || '');
      setCity(data?.city || '');
      setCountry(data?.country || '');
      setEmergencyName(data?.emergencyContact?.name || '');
      setEmergencyPhone(data?.emergencyContact?.phone || '');
    });

    getDocs(query(collection(db, 'plans'), where('participants', 'array-contains', uid))).then((snap) => {
      setPlanCount(snap.size);
      let votes = 0;
      snap.docs.forEach((d) => {
        if ((d.data().votes || []).includes(uid)) votes++;
      });
      setVoteCount(votes);
    });

    Animated.spring(avatarScale, {
      toValue: 1,
      tension: 60,
      friction: 7,
      delay: 200,
      useNativeDriver: true,
    }).start();
  }, []);

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
    await updateDoc(doc(db, 'users', uid), updates);
    setProfile((p) =>
      p ? { ...p, displayName, bio, username: trimmedUsername, city: city.trim(), country: country.trim() } : p
    );
    setEditing(false);
    setSaving(false);
    showToast('Profile saved!');
  };

  const handleAvatarPick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingAvatar(true);
    try {
      const uri = result.assets[0].uri;
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = () => reject(new Error('Network request failed'));
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
      });
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Banner ── */}
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={['#f43f5e33', '#080608']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />

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
                  <Ionicons name="cloud-upload-outline" size={22} color={Colors.text} />
                </View>
              )}
            </Animated.View>
            {/* Camera badge */}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={12} color={Colors.text} />
            </View>
          </TouchableOpacity>

          {/* Name & handle */}
          <Text style={styles.heroName}>{profile?.displayName || 'Loading...'}</Text>
          {profile?.username ? (
            <Text style={styles.heroHandle}>@{profile.username}</Text>
          ) : null}
          {profile?.bio ? (
            <Text style={styles.heroBio}>{profile.bio}</Text>
          ) : null}
          {hasLocation ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.locationText}>
                {[profile?.city, profile?.country].filter(Boolean).join(', ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Stats Row ── */}
        <View style={styles.statsContainer}>
          <StatChip label="Plans" value={planCount} />
          <View style={styles.statDivider} />
          <StatChip label="Votes Cast" value={voteCount} />
          <View style={styles.statDivider} />
          <StatChip
            label="Rating"
            value={ratingAvg != null ? ratingAvg.toFixed(1) : '--'}
            gold={ratingAvg != null}
          />
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
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    overflow: 'hidden',
  },
  avatarWrapper: {
    marginBottom: Spacing.md,
    position: 'relative',
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.primaryBorder,
    ...Shadow.roseStrong,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.black,
    color: Colors.primary,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 48,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  heroName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  heroHandle: {
    fontSize: FontSize.md,
    color: Colors.primary,
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
    color: Colors.textMuted,
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.glassBorder,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
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
    borderColor: Colors.glassBorder,
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
    color: Colors.textMuted,
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
    borderColor: Colors.glassBorderStrong,
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
    borderColor: Colors.glassBorder,
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
    backgroundColor: Colors.glassBorder,
    marginVertical: Spacing.md,
  },
});
