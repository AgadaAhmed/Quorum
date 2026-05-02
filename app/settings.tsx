import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useToast } from '../components/Toast';
import { signOut, deleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import { auth, db } from '../lib/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import { Colors, FontSize, Spacing, Radius } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showInSearch, setShowInSearch] = useState(true);
  const [showLocation, setShowLocation] = useState(true);
  const [privateProfile, setPrivateProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const uid = auth.currentUser?.uid || '';

  useEffect(() => {
    if (!auth.currentUser) router.replace('/(auth)/login');
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      const data = snap.data();
      setNotificationsEnabled(data?.notificationsEnabled !== false);
      setShowInSearch(data?.showInSearch !== false);
      setShowLocation(data?.showLocation ?? true);
      setPrivateProfile(data?.privateProfile ?? false);
    });
    return unsub;
  }, [uid]);

  const toggleShowLocation = async (val: boolean) => {
    setShowLocation(val);
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), { showLocation: val });
  };

  const togglePrivateProfile = async (val: boolean) => {
    setPrivateProfile(val);
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), { privateProfile: val });
  };

  const updatePref = async (key: string, value: boolean) => {
    Haptics.selectionAsync();
    try {
      await updateDoc(doc(db, 'users', uid), { [key]: value });
    } catch {
      // Revert local state on failure
      if (key === 'notificationsEnabled') setNotificationsEnabled(!value);
      if (key === 'showInSearch') setShowInSearch(!value);
      showToast('Failed to save setting', 'error');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          try {
            await signOut(auth);
            router.replace('/(auth)/login');
          } catch {
            showToast('Failed to sign out', 'error');
          }
        },
      },
    ]);
  };

  const handleChangePassword = async () => {
    const email = auth.currentUser?.email;
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert('Email Sent', `A password reset link has been sent to ${email}.`);
    } catch {
      Alert.alert('Error', 'Failed to send reset email. Please try again.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Your plans, friends, and profile will be deleted forever.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete',
                  style: 'destructive',
                  onPress: async () => {
                    setLoading(true);
                    try {
                      await deleteDoc(doc(db, 'users', uid));
                      const user = auth.currentUser;
                      if (user) await deleteUser(user);
                      router.replace('/(auth)/login');
                    } catch (e: any) {
                      Alert.alert('Error', e.message || 'Failed to delete account. You may need to sign in again.');
                    } finally {
                      setLoading(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Notifications */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.section}>
          <SettingRow
            label="Push Notifications"
            description="Get notified about plan updates and friend requests"
            value={notificationsEnabled}
            onValueChange={(v) => {
              setNotificationsEnabled(v);
              updatePref('notificationsEnabled', v);
            }}
            icon="notifications-outline"
          />
          <View style={styles.divider} />
          <SettingRow
            label="Appear in Search"
            description="Allow other users to find you by name or username"
            value={showInSearch}
            onValueChange={(v) => {
              setShowInSearch(v);
              updatePref('showInSearch', v);
            }}
            icon="eye-outline"
          />
        </View>

        {/* Privacy */}
        <Text style={styles.sectionLabel}>Privacy</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <Ionicons name="location-outline" size={20} color={Colors.textSecondary} style={{ marginRight: 4 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Show location on profile</Text>
              <Text style={styles.settingDesc}>Display your city publicly</Text>
            </View>
            <Switch
              value={showLocation}
              onValueChange={toggleShowLocation}
              trackColor={{ false: Colors.glassBorder, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} style={{ marginRight: 4 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Private profile</Text>
              <Text style={styles.settingDesc}>Only friends can see your plans</Text>
            </View>
            <Switch
              value={privateProfile}
              onValueChange={togglePrivateProfile}
              trackColor={{ false: Colors.glassBorder, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
        </View>

        {/* Help & About */}
        <Text style={styles.sectionLabel}>Help & About</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={() => Linking.openURL('mailto:support@quorum.app')}>
            <Ionicons name="mail-outline" size={22} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: Colors.primary }]}>Contact Support</Text>
              <Text style={styles.actionDesc}>support@quorum.app</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={() => Linking.openURL('https://quorum.app/privacy')}>
            <Ionicons name="document-text-outline" size={22} color={Colors.textSecondary} />
            <Text style={styles.actionLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={() => Linking.openURL('https://quorum.app/terms')}>
            <Ionicons name="shield-checkmark-outline" size={22} color={Colors.textSecondary} />
            <Text style={styles.actionLabel}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{auth.currentUser?.email || '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons name="finger-print-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
            <Text style={styles.infoLabel}>User ID</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{uid.slice(0, 16)}…</Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={handleChangePassword}>
            <Ionicons name="key-outline" size={22} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: Colors.primary }]}>Change Password</Text>
              <Text style={styles.actionDesc}>Send a reset link to your email</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <Text style={styles.sectionLabel}>Actions</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={22} color={Colors.error} />
            <Text style={styles.actionLabel}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <Text style={[styles.sectionLabel, { color: Colors.error }]}>Danger Zone</Text>
        <View style={[styles.section, styles.dangerSection]}>
          <TouchableOpacity style={styles.actionRow} onPress={handleDeleteAccount} disabled={loading}>
            <Ionicons name="warning-outline" size={22} color={Colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: Colors.error }]}>Delete Account</Text>
              <Text style={styles.actionDesc}>Permanently delete all your data</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Quorum v1.0.0</Text>
      </ScrollView>
    </ScreenWrapper>
  );
}

function SettingRow({ label, description, value, onValueChange, icon }: {
  label: string; description: string; value: boolean; onValueChange: (v: boolean) => void; icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.settingRow}>
      {icon && <Ionicons name={icon} size={20} color={Colors.textSecondary} style={{ marginRight: 4 }} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.glassBorder, true: Colors.primary }}
        thumbColor={Colors.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 40 },
  sectionLabel: {
    fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: Spacing.md, marginBottom: 4,
  },
  section: {
    backgroundColor: Colors.surfaceRaised, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.glassBorder, overflow: 'hidden',
  },
  dangerSection: { borderColor: Colors.error + '44' },
  divider: { height: 1, backgroundColor: Colors.glassBorder, marginHorizontal: Spacing.md },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  settingLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  settingDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  infoLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  infoValue: { fontSize: FontSize.md, color: Colors.textMuted, maxWidth: '55%', textAlign: 'right' },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  actionLabel: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  actionDesc: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  version: {
    textAlign: 'center', color: Colors.textMuted, fontSize: FontSize.sm, marginTop: Spacing.xl,
  },
});
