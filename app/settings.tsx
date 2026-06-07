import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
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
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import { auth, db } from '../lib/firebase';
import { useSubscription } from '../hooks/useSubscription';
import PaywallModal from '../components/PaywallModal';
import ScreenWrapper from '../components/ScreenWrapper';
import { Colors, FontSize, FontWeight, Spacing, Radius, Fonts } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

const APP_VERSION = 'Quorum v1.0.0';
const SUPPORT_EMAIL = 'support@quorum.app';

// Shared inline-style replacements (declared once, not per-render).
const FLEX_1 = { flex: 1 } as const;
const HEADER_SPACER = { width: 36 } as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { isPro } = useSubscription();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showInSearch, setShowInSearch] = useState(true);
  const [showLocation, setShowLocation] = useState(true);
  const [privateProfile, setPrivateProfile] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const user = auth.currentUser;
  const uid = user?.uid ?? '';
  const email = user?.email ?? '';

  // Redirect unauthenticated users to login.
  useEffect(() => {
    if (!auth.currentUser) router.replace('/(auth)/login');
  }, [router]);

  // Live-sync preference toggles from Firestore.
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

  // Single optimistic-update helper for all boolean prefs. Applies local state
  // immediately, persists, and reverts + toasts on failure.
  const updatePref = useCallback(
    async (
      key: 'notificationsEnabled' | 'showInSearch' | 'showLocation' | 'privateProfile',
      value: boolean,
      setLocal: (v: boolean) => void,
    ) => {
      if (!uid) return;
      Haptics.selectionAsync();
      setLocal(value);
      try {
        await updateDoc(doc(db, 'users', uid), { [key]: value });
      } catch {
        setLocal(!value);
        showToast('Failed to save setting', 'error');
      }
    },
    [uid, showToast],
  );

  const onToggleNotifications = useCallback(
    (v: boolean) => updatePref('notificationsEnabled', v, setNotificationsEnabled),
    [updatePref],
  );
  const onToggleSearch = useCallback(
    (v: boolean) => updatePref('showInSearch', v, setShowInSearch),
    [updatePref],
  );
  const onToggleLocation = useCallback(
    (v: boolean) => updatePref('showLocation', v, setShowLocation),
    [updatePref],
  );
  const onTogglePrivate = useCallback(
    (v: boolean) => updatePref('privateProfile', v, setPrivateProfile),
    [updatePref],
  );

  const handleManageSubscription = useCallback(() => {
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions';
    Linking.openURL(url).catch(() => showToast('Could not open subscriptions', 'error'));
  }, [showToast]);

  const openUrl = useCallback(
    (url: string) => {
      Linking.openURL(url).catch(() => showToast('Could not open link', 'error'));
    },
    [showToast],
  );

  const handleSignOut = useCallback(() => {
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
  }, [router, showToast]);

  const handleChangePassword = useCallback(async () => {
    if (!email) {
      showToast('No email on file', 'error');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert('Email Sent', `A password reset link has been sent to ${email}.`);
    } catch {
      Alert.alert('Error', 'Failed to send reset email. Please try again.');
    }
  }, [email, showToast]);

  const handleDeleteAccount = useCallback(() => {
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
                    const current = auth.currentUser;
                    if (!current || !uid) return;
                    setDeleting(true);
                    try {
                      await deleteDoc(doc(db, 'users', uid));
                      await deleteUser(current);
                      router.replace('/(auth)/login');
                    } catch (e) {
                      const msg =
                        e instanceof Error
                          ? e.message
                          : 'Failed to delete account. You may need to sign in again.';
                      Alert.alert('Error', msg);
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [router, uid]);

  const handleBack = useCallback(() => router.back(), [router]);
  const openPaywall = useCallback(() => setShowPaywall(true), []);
  const closePaywall = useCallback(() => setShowPaywall(false), []);
  const contactSupport = useCallback(() => openUrl(`mailto:${SUPPORT_EMAIL}`), [openUrl]);
  const openPrivacy = useCallback(() => openUrl('https://quorum.app/privacy'), [openUrl]);
  const openTerms = useCallback(() => openUrl('https://quorum.app/terms'), [openUrl]);

  const shortUid = useMemo(() => (uid ? `${uid.slice(0, 16)}…` : '—'), [uid]);

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={HIT_SLOP}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={HEADER_SPACER} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Subscription */}
        <Text style={styles.sectionLabel}>Subscription</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <Ionicons
              name="star-outline"
              size={20}
              color={isPro ? Colors.primary : Colors.textSecondary}
              style={styles.rowIcon}
            />
            <View style={FLEX_1}>
              <Text style={styles.settingLabel}>Current plan</Text>
              <Text style={[styles.planValue, isPro && styles.planValuePro]}>
                {isPro ? 'Quorum Pro' : 'Free'}
              </Text>
            </View>
            {!isPro && (
              <TouchableOpacity
                style={styles.upgradeBadge}
                onPress={openPaywall}
                activeOpacity={0.8}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Upgrade to Quorum Pro"
              >
                <Ionicons name="star" size={13} color={Colors.background} />
                <Text style={styles.upgradeBadgeText}>Upgrade</Text>
              </TouchableOpacity>
            )}
          </View>
          {isPro && (
            <>
              <View style={styles.divider} />
              <ActionRow
                icon="open-outline"
                label="Manage subscription"
                onPress={handleManageSubscription}
              />
            </>
          )}
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.section}>
          <SettingRow
            label="Push Notifications"
            description="Get notified about plan updates and friend requests"
            value={notificationsEnabled}
            onValueChange={onToggleNotifications}
            icon="notifications-outline"
          />
          <View style={styles.divider} />
          <SettingRow
            label="Appear in Search"
            description="Allow other users to find you by name or username"
            value={showInSearch}
            onValueChange={onToggleSearch}
            icon="eye-outline"
          />
        </View>

        {/* Privacy */}
        <Text style={styles.sectionLabel}>Privacy</Text>
        <View style={styles.section}>
          <SettingRow
            label="Show location on profile"
            description="Display your city publicly"
            value={showLocation}
            onValueChange={onToggleLocation}
            icon="location-outline"
          />
          <View style={styles.divider} />
          <SettingRow
            label="Private profile"
            description="Only friends can see your plans"
            value={privateProfile}
            onValueChange={onTogglePrivate}
            icon="lock-closed-outline"
          />
        </View>

        {/* Help & About */}
        <Text style={styles.sectionLabel}>Help & About</Text>
        <View style={styles.section}>
          <ActionRow
            icon="mail-outline"
            label="Contact Support"
            description={SUPPORT_EMAIL}
            onPress={contactSupport}
            emphasize
          />
          <View style={styles.divider} />
          <ActionRow icon="document-text-outline" label="Privacy Policy" onPress={openPrivacy} />
          <View style={styles.divider} />
          <ActionRow icon="shield-checkmark-outline" label="Terms of Service" onPress={openTerms} />
        </View>

        {/* Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {email || '—'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons
              name="finger-print-outline"
              size={18}
              color={Colors.textMuted}
              style={styles.infoIcon}
            />
            <Text style={styles.infoLabel}>User ID</Text>
            <Text style={styles.infoValueMono} numberOfLines={1}>
              {shortUid}
            </Text>
          </View>
          <View style={styles.divider} />
          <ActionRow
            icon="key-outline"
            label="Change Password"
            description="Send a reset link to your email"
            onPress={handleChangePassword}
            emphasize
          />
        </View>

        {/* Actions */}
        <Text style={styles.sectionLabel}>Actions</Text>
        <View style={styles.section}>
          <ActionRow icon="log-out-outline" label="Sign Out" onPress={handleSignOut} />
        </View>

        {/* Danger Zone */}
        <View style={styles.dangerLabelRow}>
          <Ionicons name="alert-circle" size={14} color={Colors.error} />
          <Text style={[styles.sectionLabel, styles.dangerLabel]}>Danger Zone</Text>
        </View>
        <View style={[styles.section, styles.dangerSection]}>
          <ActionRow
            icon="warning-outline"
            label="Delete Account"
            description="Permanently delete all your data"
            onPress={handleDeleteAccount}
            disabled={deleting}
            danger
          />
        </View>
        <Text style={styles.dangerCaption}>This action is permanent and cannot be undone.</Text>

        <Text style={styles.version}>{APP_VERSION}</Text>
      </ScrollView>

      <PaywallModal visible={showPaywall} onClose={closePaywall} />
    </ScreenWrapper>
  );
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

const SettingRow = React.memo(function SettingRow({
  label,
  description,
  value,
  onValueChange,
  icon,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  icon?: IconName;
}) {
  return (
    <View style={styles.settingRow}>
      {icon && <Ionicons name={icon} size={20} color={Colors.textSecondary} style={styles.rowIcon} />}
      <View style={FLEX_1}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={SWITCH_TRACK}
        thumbColor={value ? Colors.background : Colors.surfaceRaised}
        ios_backgroundColor={Colors.surfaceBright}
        accessibilityLabel={label}
      />
    </View>
  );
});

// Off = visible grey track with light thumb; On = solid black track with white
// thumb. Gives a clear, legible two-state read without relying on hue.
const SWITCH_TRACK = { false: Colors.surfaceBright, true: Colors.primary } as const;

const ActionRow = React.memo(function ActionRow({
  icon,
  label,
  description,
  onPress,
  disabled,
  emphasize,
  danger,
}: {
  icon: IconName;
  label: string;
  description?: string;
  onPress: () => void;
  disabled?: boolean;
  emphasize?: boolean;
  danger?: boolean;
}) {
  const tint = danger ? Colors.error : emphasize ? Colors.primary : Colors.textSecondary;
  const labelStyle = danger || emphasize ? [styles.actionLabel, { color: tint }] : styles.actionLabel;
  return (
    <TouchableOpacity
      style={[styles.actionRow, disabled && styles.actionRowDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Ionicons name={icon} size={22} color={tint} />
      {description ? (
        <View style={FLEX_1}>
          <Text style={labelStyle}>{label}</Text>
          <Text style={styles.actionDesc}>{description}</Text>
        </View>
      ) : (
        <Text style={labelStyle}>{label}</Text>
      )}
      <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderStrong,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: {
    fontFamily: Fonts.headingBold,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  content: { paddingBottom: Spacing.xxl },

  // ── Section header label ────────────────────────────────────────────────
  sectionLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.container,
  },

  // ── Grouped section container ───────────────────────────────────────────
  section: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.xs,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: Spacing.container + Spacing.md + Spacing.sm },

  // ── Danger zone (carries caution via weight + accent, not hue) ──────────
  dangerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.container,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  dangerLabel: {
    color: Colors.error,
    fontWeight: FontWeight.black,
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 0,
  },
  dangerSection: {
    borderColor: Colors.borderStrong,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  dangerCaption: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.container,
    marginTop: Spacing.sm,
    lineHeight: 17,
  },

  // ── Icons ───────────────────────────────────────────────────────────────
  rowIcon: { marginRight: Spacing.xs, width: 24, textAlign: 'center' },
  infoIcon: { marginRight: Spacing.sm, width: 20, textAlign: 'center' },

  // ── Toggle row (label + description + Switch) ───────────────────────────
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.container,
    paddingVertical: Spacing.gutter,
    minHeight: 64,
  },
  settingLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  settingDesc: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 20,
  },

  // ── Read-only info row (label + value) ──────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.container,
    paddingVertical: Spacing.gutter,
    minHeight: 56,
  },
  infoLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: FontWeight.semibold,
  },
  infoValue: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    maxWidth: '55%',
    textAlign: 'right',
  },
  // Identifiers/figures: tabular + mono so they read as data and don't jitter.
  infoValueMono: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    maxWidth: '55%',
    textAlign: 'right',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },

  // ── Action / navigation row ─────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.container,
    paddingVertical: Spacing.gutter,
    minHeight: 56,
  },
  actionRowDisabled: { opacity: 0.4 },
  actionLabel: {
    flex: 1,
    fontFamily: Fonts.bodySemibold,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  actionDesc: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },

  version: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: Spacing.xl,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ── Subscription plan value + upgrade badge (the one accent) ────────────
  planValue: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 3,
    letterSpacing: 0.3,
  },
  planValuePro: { color: Colors.primary, fontWeight: FontWeight.bold },
  upgradeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: 'center',
  },
  upgradeBadgeText: {
    color: Colors.background,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.heavy,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
