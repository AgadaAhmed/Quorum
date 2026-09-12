import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
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
import { TAGLINE_MAX } from '../lib/profileCustomization';
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
