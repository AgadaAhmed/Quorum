import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import Avatar from './Avatar';
import { type ThemePalette } from '../lib/theme';
import { useThemedStyles } from '../lib/ThemeContext';
import type { DecorationId } from '../lib/profileCustomization';

interface ProfileDoc {
  displayName?: string;
  avatarUrl?: string;
  avatarGifUrl?: string;
  avatarStillUrl?: string;
  decorationId?: DecorationId | null;
}

/**
 * A small circular profile avatar (the user's pfp) that opens the profile
 * screen. Lives in the top-right of the main tab screens now that Profile is
 * no longer a bottom tab. Renders the still frame — animated pfps only play on
 * the profile screens themselves.
 */
export default function ProfileAvatarButton() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const [uid, setUid] = useState(auth.currentUser?.uid || '');
  const [profile, setProfile] = useState<ProfileDoc>({
    displayName: auth.currentUser?.displayName || undefined,
    avatarUrl: auth.currentUser?.photoURL || undefined,
  });

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || '')), []);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      const d = snap.data() as ProfileDoc | undefined;
      if (d) setProfile(d);
    });
  }, [uid]);

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => router.push('/profile' as any)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
    >
      <Avatar
        name={profile.displayName}
        uploadUrl={profile.avatarUrl}
        gifUrl={profile.avatarGifUrl}
        stillUrl={profile.avatarStillUrl}
        decorationId={profile.decorationId ?? null}
        animated
        imageStyle={styles.image}
        fallbackStyle={styles.fallback}
        initialStyle={styles.initial}
      />
    </TouchableOpacity>
  );
}

const SIZE = 36;

const makeStyles = (Colors: ThemePalette) =>
  StyleSheet.create({
    btn: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surfaceRaised,
    },
    image: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
    fallback: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceOverlay,
    },
    initial: { fontSize: 15, fontWeight: '800', color: Colors.text },
  });
