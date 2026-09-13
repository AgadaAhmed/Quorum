import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Avatar from './Avatar';
import ProfileBanner from './ProfileBanner';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { resolveColor } from '../lib/profileCustomization';

export type ProfileDraft = {
  displayName?: string;
  avatarUrl?: string;
  avatarGifUrl?: string;
  avatarStillUrl?: string;
  bannerGifUrl?: string;
  bannerStillUrl?: string;
  tagline?: string;
  bio?: string;
  nameColor?: string;
};

export default function ProfilePreviewCard({ draft }: { draft: ProfileDraft }) {
  const nameColorValue = resolveColor(draft.nameColor);
  const hasGif = !!draft.bannerGifUrl;
  const dark = hasGif;
  const text = dark ? Colors.onDark : Colors.text;
  const bodyText = dark ? Colors.onDark : Colors.textSecondary;

  return (
    <View style={styles.card} testID="profile-preview-card">
      {/* Full-bleed background: the banner gif fills the card when set. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {hasGif ? (
          <>
            <ProfileBanner
              gifUrl={draft.bannerGifUrl}
              stillUrl={draft.bannerStillUrl}
              animated
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.scrim} />
          </>
        ) : null}
      </View>

      <View style={styles.body}>
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
        <Text style={[styles.name, { color: nameColorValue || text }]} numberOfLines={1}>
          {draft.displayName || 'Your name'}
        </Text>
        {draft.tagline ? (
          <Text style={[styles.tagline, { color: bodyText }]} numberOfLines={1}>
            {draft.tagline}
          </Text>
        ) : null}
        {draft.bio ? (
          <Text style={[styles.bio, { color: bodyText }]} numberOfLines={2}>
            {draft.bio}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const AVATAR = 64;
const styles = StyleSheet.create({
  card: { minHeight: 150, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  body: { alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.lg },
  avatarRing: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: 'hidden', borderWidth: 2, borderColor: Colors.background, backgroundColor: Colors.surface },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  avatarInitial: { fontSize: AVATAR * 0.42, color: Colors.text, fontWeight: FontWeight.bold },
  name: { marginTop: Spacing.sm, fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.text },
  tagline: { marginTop: 2, fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic' },
  bio: { marginTop: Spacing.xs, fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
});
