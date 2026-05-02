import React, { useEffect, useState } from 'react';
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
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const IMG_SIZE = (width - 48 - 8) / 3;

interface Props {
  planId: string;
  isParticipant: boolean;
}

interface Moment {
  id: string;
  url: string;
  uploadedBy: string;
  createdAt: any;
}

export default function MomentsGallery({ planId, isParticipant }: Props) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'plans', planId, 'moments'),
      (snap) => {
        const data = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Moment)
        );
        data.sort(
          (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
        );
        setMoments(data);
      }
    );
    return unsub;
  }, [planId]);

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets[0]) return;
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
    } catch {
      // upload errors don't block the UI
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      {isParticipant && (
        <TouchableOpacity
          style={styles.uploadBtn}
          onPress={handleUpload}
          disabled={uploading}
          activeOpacity={0.8}
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

      {moments.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {isParticipant
              ? 'Be the first to share a moment!'
              : 'No moments yet'}
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {moments.map((m) => (
            <Image
              key={m.id}
              source={{ uri: m.url }}
              style={styles.img}
              resizeMode="cover"
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.md },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primaryBorder,
    backgroundColor: Colors.primaryDim,
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  img: { width: IMG_SIZE, height: IMG_SIZE, borderRadius: Radius.sm },
});
