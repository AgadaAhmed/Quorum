import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, FirestoreError, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const GRID_GAP = 4;
const IMG_SIZE = (width - Spacing.md * 2 - GRID_GAP * 2) / 3;

interface Props {
  planId: string;
  isParticipant: boolean;
}

interface Moment {
  id: string;
  url: string;
  uploadedBy: string;
  createdAt: { seconds: number } | null;
}

function MomentImage({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={styles.img} resizeMode="cover" accessibilityIgnoresInvertColors />;
}

const MemoMomentImage = memo(MomentImage);

function MomentsGallery({ planId, isParticipant }: Props) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!planId) return;
    const unsub = onSnapshot(
      collection(db, 'plans', planId, 'moments'),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Moment));
        data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setMoments(data);
      },
      (err: FirestoreError) => {
        // Listener errors (e.g. permissions) shouldn't crash the screen.
        if (__DEV__) console.warn('[MomentsGallery] snapshot error:', err.message);
      }
    );
    return unsub;
  }, [planId]);

  const handleUpload = useCallback(async () => {
    if (uploading) return;

    // Request library access before opening the picker.
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setUploading(true);
    try {
      const uri = result.assets[0].uri;
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const storageRef = ref(
        storage,
        `moments/${planId}/${Math.random().toString(36).slice(2) + Date.now().toString(36)}.jpg`
      );
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, 'plans', planId, 'moments'), {
        url,
        uploadedBy: uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      // Upload errors don't block the UI.
      if (__DEV__) console.warn('[MomentsGallery] upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, [planId, uploading]);

  const isEmpty = moments.length === 0;

  const emptyText = useMemo(
    () => (isParticipant ? 'Be the first to share a moment' : 'No moments yet'),
    [isParticipant]
  );

  return (
    <View style={styles.container}>
      {isParticipant && (
        <TouchableOpacity
          style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
          onPress={handleUpload}
          disabled={uploading}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ disabled: uploading, busy: uploading }}
          accessibilityLabel="Add a moment"
        >
          {uploading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={18} color={Colors.primary} />
              <Text style={styles.uploadLabel}>Add a Moment</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {isEmpty ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {moments.map((m) => (
            <MemoMomentImage key={m.id} uri={m.url} />
          ))}
        </View>
      )}
    </View>
  );
}

export default memo(MomentsGallery);

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.md },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs + 4,
    minHeight: 48,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primaryBorder,
    backgroundColor: Colors.primaryDim,
  },
  uploadBtnDisabled: {
    opacity: 0.6,
  },
  uploadLabel: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  empty: { alignItems: 'center', gap: 10, paddingTop: 24 },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  img: { width: IMG_SIZE, height: IMG_SIZE, borderRadius: Radius.sm, backgroundColor: Colors.surfaceRaised },
});
