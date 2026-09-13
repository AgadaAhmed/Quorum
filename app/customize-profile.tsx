import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../lib/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import { useToast } from '../components/Toast';
import ProfilePreviewCard, { ProfileDraft } from '../components/ProfilePreviewCard';
import GifPicker from '../components/GifPicker';
import ColorSwatchRow from '../components/ColorSwatchRow';
import { GifResult } from '../lib/gifProvider';
import { TAGLINE_MAX, type AccentMode } from '../lib/profileCustomization';

const ACCENT_MODES: { key: AccentMode; label: string }[] = [
  { key: 'solid', label: 'Solid' },
  { key: 'transparent', label: 'Transparent' },
  { key: 'none', label: 'None' },
];
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

export default function CustomizeProfileScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [uid, setUid] = useState(auth.currentUser?.uid || '');
  const [draft, setDraft] = useState<ProfileDraft>({});
  const [gifTarget, setGifTarget] = useState<null | 'avatar' | 'banner'>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setUid(user.uid);
      const snap = await getDoc(doc(db, 'users', user.uid));
      const d: any = snap.data() || {};
      setDraft({
        displayName: d.displayName,
        avatarUrl: d.avatarUrl,
        avatarGifUrl: d.avatarGifUrl,
        avatarStillUrl: d.avatarStillUrl,
        bannerGifUrl: d.bannerGifUrl,
        bannerStillUrl: d.bannerStillUrl,
        tagline: d.tagline || '',
        bio: d.bio,
        profileAccent: d.profileAccent || undefined,
        profileAccentMode: d.profileAccentMode || 'transparent',
        nameColor: d.nameColor || undefined,
      });
    });
    return unsub;
  }, []);

  const onGifSelected = useCallback(
    (result: GifResult) => {
      setDraft((prev) =>
        gifTarget === 'avatar'
          ? { ...prev, avatarGifUrl: result.gifUrl, avatarStillUrl: result.stillUrl }
          : { ...prev, bannerGifUrl: result.gifUrl, bannerStillUrl: result.stillUrl }
      );
      setGifTarget(null);
    },
    [gifTarget]
  );

  const onApply = useCallback(async () => {
    if (!uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        avatarGifUrl: draft.avatarGifUrl ?? '',
        avatarStillUrl: draft.avatarStillUrl ?? '',
        bannerGifUrl: draft.bannerGifUrl ?? '',
        bannerStillUrl: draft.bannerStillUrl ?? '',
        tagline: (draft.tagline ?? '').trim(),
        profileAccent: draft.profileAccent ?? '',
        profileAccentMode: draft.profileAccentMode ?? 'transparent',
        nameColor: draft.nameColor ?? '',
      });
      showToast('Customization applied!');
      router.back();
    } catch {
      showToast('Failed to apply', 'error');
    } finally {
      setSaving(false);
    }
  }, [uid, draft, showToast, router]);

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Customize your profile</Text>
        <ProfilePreviewCard draft={draft} />

        <TouchableOpacity style={styles.control} onPress={() => setGifTarget('avatar')} testID="pick-avatar-gif">
          <Ionicons name="image-outline" size={18} color={Colors.text} />
          <Text style={styles.controlText}>Choose animated avatar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.control} onPress={() => setGifTarget('banner')} testID="pick-banner-gif">
          <Ionicons name="images-outline" size={18} color={Colors.text} />
          <Text style={styles.controlText}>Choose banner</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Tagline</Text>
        <TextInput
          testID="customize-tagline"
          value={draft.tagline}
          onChangeText={(t) => setDraft((p) => ({ ...p, tagline: t }))}
          placeholder="A short line under your name"
          placeholderTextColor={Colors.textMuted}
          maxLength={TAGLINE_MAX}
          style={styles.input}
        />

        <Text style={styles.label}>Name color</Text>
        <ColorSwatchRow selectedKey={draft.nameColor} onSelect={(k) => setDraft((p) => ({ ...p, nameColor: k }))} />

        <Text style={styles.label}>Profile accent</Text>
        <ColorSwatchRow selectedKey={draft.profileAccent} onSelect={(k) => setDraft((p) => ({ ...p, profileAccent: k }))} />
        <View style={styles.modeRow}>
          {ACCENT_MODES.map((m) => {
            const active = (draft.profileAccentMode ?? 'transparent') === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setDraft((p) => ({ ...p, profileAccentMode: m.key }))}
                style={[styles.modeBtn, active && styles.modeBtnActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>Applies when you have no banner GIF. A GIF fills the whole profile.</Text>

        <TouchableOpacity
          style={[styles.apply, saving && { opacity: 0.6 }]}
          onPress={onApply}
          disabled={saving}
          testID="customize-apply"
        >
          <Text style={styles.applyText}>Apply changes</Text>
        </TouchableOpacity>
      </ScrollView>

      <GifPicker visible={gifTarget !== null} onSelect={onGifSelected} onClose={() => setGifTarget(null)} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md, gap: Spacing.sm },
  heading: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.text, marginBottom: Spacing.sm },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
  },
  controlText: { color: Colors.text, fontSize: FontSize.md },
  label: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: Spacing.sm },
  hint: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.xs },
  modeRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  modeBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeBtnActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  modeText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  modeTextActive: { color: Colors.background },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
  },
  apply: { marginTop: Spacing.lg, backgroundColor: Colors.text, borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center' },
  applyText: { color: Colors.background, fontSize: FontSize.md, fontWeight: FontWeight.bold },
});
