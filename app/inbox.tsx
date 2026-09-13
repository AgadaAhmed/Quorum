import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import Avatar from '../components/Avatar';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/ThemeContext';

type Thread = {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastSenderId?: string;
  lastTimestamp?: Timestamp | null;
};

type PeerInfo = { displayName?: string; username?: string; avatarUrl?: string; avatarStillUrl?: string };

function timeLabel(ts?: Timestamp | null): string {
  const d = ts?.toDate?.();
  if (!d) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function InboxScreen() {
  const router = useRouter();
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [uid, setUid] = useState(auth.currentUser?.uid || '');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [peers, setPeers] = useState<Record<string, PeerInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || '')), []);

  useEffect(() => {
    if (!uid) return;
    // A single array-contains filter needs no composite index; sort + kind
    // filter happen client-side. Only DM rooms carry a participants array.
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((r) => r.id.startsWith('dm__')) as Thread[];
        rows.sort(
          (a, b) => (b.lastTimestamp?.toMillis?.() || 0) - (a.lastTimestamp?.toMillis?.() || 0)
        );
        setThreads(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [uid]);

  // Resolve peer profiles for the visible threads.
  useEffect(() => {
    const missing = threads
      .map((t) => t.participants.find((p) => p !== uid))
      .filter((p): p is string => !!p && !peers[p]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((id) => getDoc(doc(db, 'users', id))))
      .then((docs) => {
        if (cancelled) return;
        const next: Record<string, PeerInfo> = {};
        docs.forEach((d) => {
          if (d.exists()) next[d.id] = d.data() as PeerInfo;
        });
        if (Object.keys(next).length) setPeers((prev) => ({ ...prev, ...next }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [threads, uid, peers]);

  const openGlobal = useCallback(
    () => router.push({ pathname: '/chat', params: { kind: 'global', title: 'Global Chat' } } as any),
    [router]
  );

  const openThread = useCallback(
    (t: Thread) => {
      const peerId = t.participants.find((p) => p !== uid);
      const peer = peerId ? peers[peerId] : undefined;
      const name = peer?.displayName || peer?.username || 'Chat';
      router.push({ pathname: '/chat', params: { roomId: t.id, kind: 'dm', title: name } } as any);
    },
    [router, uid, peers]
  );

  const renderItem = useCallback(
    ({ item }: { item: Thread }) => {
      const peerId = item.participants.find((p) => p !== uid);
      const peer = peerId ? peers[peerId] : undefined;
      const name = peer?.displayName || peer?.username || 'Someone';
      const preview =
        (item.lastSenderId === uid ? 'You: ' : '') + (item.lastMessage || 'Say hi');
      return (
        <TouchableOpacity style={styles.row} onPress={() => openThread(item)} activeOpacity={0.8}>
          <View style={styles.avatar}>
            <Avatar
              name={name}
              uploadUrl={peer?.avatarUrl}
              stillUrl={peer?.avatarStillUrl}
              imageStyle={styles.avatarImg}
              fallbackStyle={styles.avatarFallback}
              initialStyle={styles.avatarInitial}
            />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
            <Text style={styles.rowPreview} numberOfLines={1}>{preview}</Text>
          </View>
          <Text style={styles.rowTime}>{timeLabel(item.lastTimestamp)}</Text>
        </TouchableOpacity>
      );
    },
    [styles, uid, peers, openThread]
  );

  const listHeader = useMemo(
    () => (
      <>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity style={[styles.row, styles.globalRow]} onPress={openGlobal} activeOpacity={0.8}>
          <View style={[styles.avatar, styles.globalIcon]}>
            <Ionicons name="earth" size={22} color={Colors.onDark} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowName}>Global chat</Text>
            <Text style={styles.rowPreview} numberOfLines={1}>Everyone on Quorum</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
        <Text style={styles.sectionLabel}>Direct messages</Text>
      </>
    ),
    [styles, Colors, openGlobal]
  );

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>No direct messages yet. Tap someone in Global chat or on their profile to start one.</Text>
          )
        }
      />
    </ScreenWrapper>
  );
}

const AV = 48;
const makeStyles = (Colors: ThemePalette) =>
  StyleSheet.create({
    header: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
    list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
    title: {
      fontSize: FontSize.xxl,
      fontWeight: FontWeight.black,
      color: Colors.text,
      letterSpacing: -0.6,
      marginBottom: Spacing.sm,
    },
    sectionLabel: {
      fontSize: FontSize.xs,
      fontWeight: FontWeight.heavy,
      color: Colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginTop: Spacing.md,
      marginBottom: Spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    globalRow: {
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      paddingBottom: Spacing.md,
    },
    avatar: {
      width: AV,
      height: AV,
      borderRadius: AV / 2,
      overflow: 'hidden',
      backgroundColor: Colors.surfaceRaised,
    },
    globalIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
    avatarImg: { width: AV, height: AV, borderRadius: AV / 2 },
    avatarFallback: {
      width: AV,
      height: AV,
      borderRadius: AV / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceOverlay,
    },
    avatarInitial: { fontSize: 18, fontWeight: '800', color: Colors.text },
    rowText: { flex: 1 },
    rowName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
    rowPreview: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
    rowTime: { fontSize: FontSize.xs, color: Colors.textMuted },
    empty: {
      fontSize: FontSize.sm,
      color: Colors.textMuted,
      textAlign: 'center',
      marginTop: Spacing.xl,
      lineHeight: 20,
    },
  });
