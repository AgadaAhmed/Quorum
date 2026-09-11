import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from './Avatar';
import ProfileBanner from './ProfileBanner';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { resolveColor, accentGradient } from '../lib/profileCustomization';

export type ProfileDraft = {
  displayName?: string;
  avatarUrl?: string;
  avatarGifUrl?: string;
  avatarStillUrl?: string;
  bannerGifUrl?: string;
  bannerStillUrl?: string;
  tagline?: string;
  bio?: string;
  profileAccent?: string;
  nameColor?: string;
};

export default function ProfilePreviewCard({ draft }: { draft: ProfileDraft }) {
  const accentValue = resolveColor(draft.profileAccent);
  const nameColorValue = resolveColor(draft.nameColor);

  return (
    <View style={styles.card} testID="profile-preview-card">
      <ProfileBanner gifUrl={draft.bannerGifUrl} stillUrl={draft.bannerStillUrl} animated height={110} />
      <View style={styles.body}>
        {accentValue ? (
          <LinearGradient
            colors={accentGradient(accentValue)}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        ) : null}
        <View style={styles.avatarRing}>
          <Avatar
            name={draft.displayName}
            uploadUrl={draft.avatarUrl}
            gifUrl={draft.avatarGifUrl}
            stillUrl={draft.avatarStillUrl}
            animated
            imageStyle={styles.avatarImage}
            fallbackStyle={styles.avatarFallback}
            initialStyle={styles.avatarInitial}
          />
        </View>
        <Text style={[styles.name, nameColorValue ? { color: nameColorValue } : null]} numberOfLines={1}>
          {draft.displayName || 'Your name'}
        </Text>
        {draft.tagline ? (
          <Text style={[styles.tagline, accentValue ? { color: accentValue } : null]} numberOfLines={1}>
            {draft.tagline}
          </Text>
        ) : null}
        {draft.bio ? (
          <Text style={[styles.bio, accentValue ? { color: accentValue } : null]} numberOfLines={2}>
            {draft.bio}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const AVATAR = 64;
const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  body: { alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, marginTop: -AVATAR / 2 },
  avatarRing: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: 'hidden', borderWidth: 2, borderColor: Colors.background, backgroundColor: Colors.surface },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  avatarInitial: { fontSize: AVATAR * 0.42, color: Colors.text, fontWeight: FontWeight.bold },
  name: { marginTop: Spacing.sm, fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.text },
  tagline: { marginTop: 2, fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic' },
  bio: { marginTop: Spacing.xs, fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
});
