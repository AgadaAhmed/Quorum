import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import AnimatedCard from '../components/AnimatedCard';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';
import { Colors, Fonts, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import ConfettiParticles, { ConfettiRef } from '../components/ConfettiParticles';
import { useCelebration } from '../hooks/useCelebration';

// ── Types ────────────────────────────────────────────────────────────────────
type UserResult = {
  id: string;
  displayName?: string;
  username?: string;
  city?: string;
  country?: string;
  lastActive?: Timestamp | string | null;
};
type FriendRequest = { fromId: string; fromName: string };
type Tab = 'friends' | 'search' | 'requests';

const TABS: readonly Tab[] = ['friends', 'search', 'requests'] as const;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 400;
const INVITE_CODE_LENGTH = 8;

const initials = (name?: string) => (name?.trim()?.[0] || '?').toUpperCase();

const isUserOnline = (user: UserResult): boolean => {
  const raw = user.lastActive;
  if (!raw) return false;
  let date: Date | null = null;
  if (raw instanceof Timestamp) date = raw.toDate();
  else if (typeof (raw as any)?.toDate === 'function') date = (raw as any).toDate();
  else if (typeof raw === 'string') {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  if (!date) return false;
  return Date.now() - date.getTime() < ONLINE_WINDOW_MS;
};

// ── Reusable sub-components ───────────────────────────────────────────────────
const Avatar = React.memo(function Avatar({
  name,
  online,
  tint,
  tintBg,
}: {
  name?: string;
  online?: boolean;
  tint?: string;
  tintBg?: string;
}) {
  return (
    <View style={styles.avatarWrap}>
      <View style={[styles.avatar, tintBg ? { backgroundColor: tintBg } : null]}>
        <Text style={[styles.avatarText, tint ? { color: tint } : null]}>{initials(name)}</Text>
      </View>
      {online ? (
        <View style={styles.presenceRing}>
          <View style={styles.presenceDot} />
        </View>
      ) : null}
    </View>
  );
});

const IconButton = React.memo(function IconButton({
  name,
  onPress,
  label,
  size = 22,
  color = Colors.textMuted,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  size?: number;
  color?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.iconHit}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={HIT_SLOP}
    >
      <Ionicons name={name} size={size} color={color} />
    </TouchableOpacity>
  );
});

const EmptyState = React.memo(function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={32} color={Colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
});

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const LIST_CONTENT = { padding: Spacing.md, paddingBottom: 100, flexGrow: 1 };
const SEARCH_LIST_CONTENT = { paddingBottom: 100, flexGrow: 1 };

export default function SocialScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const confettiRef = useRef<ConfettiRef>(null);
  const { celebrate } = useCelebration();

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<UserResult[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<UserResult[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>('friends');
  const [joinCode, setJoinCode] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);

  const [uid, setUid] = useState(auth.currentUser?.uid || '');

  // Tab pill animation
  const tabLayouts = useRef<{ x: number; width: number }[]>([]);
  const tabPillLeft = useRef(new Animated.Value(0)).current;
  const tabPillWidth = useRef(new Animated.Value(0)).current;
  const tabPillInitialized = useRef(false);

  // Concurrency guards
  const sendingRequest = useRef(false);
  const searchSeq = useRef(0);

  // Keep latest blocklist available to the (async) search without re-subscribing.
  const blockedRef = useRef<string[]>([]);
  useEffect(() => {
    blockedRef.current = blockedUsers;
  }, [blockedUsers]);

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || '')), []);

  useEffect(() => {
    if (!auth.currentUser) router.replace('/(auth)/login');
  }, [router]);

  // Mark current user online when viewing Social
  useEffect(() => {
    if (!uid) return;
    updateDoc(doc(db, 'users', uid), { lastActive: serverTimestamp() }).catch(() => {});
  }, [uid]);

  // ── Realtime self doc → requests / friends / blocked ────────────────────────
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      async (snap) => {
        const data = snap.data() || {};
        if (!active) return;

        const requests: FriendRequest[] = Array.isArray(data.friendRequests) ? data.friendRequests : [];
        // Show stored names immediately, then refresh below with the sender's
        // current displayName (the stored fromName is a snapshot from when the
        // request was sent and goes stale if they rename).
        setFriendRequests(requests);

        const blocked: string[] = Array.isArray(data.blockedUsers) ? data.blockedUsers : [];
        setBlockedUsers(blocked);

        try {
          if (requests.length > 0) {
            const reqDocs = await Promise.all(
              requests.map((r) => getDoc(doc(db, 'users', r.fromId)).catch(() => null))
            );
            if (!active) return;
            setFriendRequests(
              requests.map((r, i) => ({
                ...r,
                fromName: reqDocs[i]?.data()?.displayName || r.fromName,
              }))
            );
          }

          if (blocked.length > 0) {
            const docs = await Promise.all(blocked.map((id) => getDoc(doc(db, 'users', id))));
            if (!active) return;
            setBlockedProfiles(
              docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() } as UserResult))
            );
          } else {
            setBlockedProfiles([]);
          }

          const friendIds: string[] = Array.isArray(data.friends) ? data.friends : [];
          if (friendIds.length > 0) {
            const docs = await Promise.all(friendIds.map((id) => getDoc(doc(db, 'users', id))));
            if (!active) return;
            setFriends(
              docs
                .filter((d) => d.exists())
                .map((d) => ({ id: d.id, ...d.data() } as UserResult))
                .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
            );
          } else {
            setFriends([]);
          }
        } catch {
          /* transient fetch failure — keep last good state */
        }
      },
      () => {
        if (active) showToast('Could not load your network', 'error');
      }
    );
    return () => {
      active = false;
      unsub();
    };
  }, [uid, showToast]);

  // ── Search (debounced, race-safe) ───────────────────────────────────────────
  const runSearch = useCallback(async () => {
    const raw = searchQuery.trim();
    if (!raw) {
      setResults([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);

    const isHandle = raw.startsWith('@');
    const term = raw.replace(/^@/, '').toLowerCase();

    try {
      const seen = new Set<string>();
      const combined: UserResult[] = [];

      const usernameSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('usernameLower', '>=', term),
          where('usernameLower', '<=', term + '')
        )
      );
      usernameSnap.docs.forEach((d) => {
        if (d.id !== uid && !seen.has(d.id)) {
          seen.add(d.id);
          combined.push({ id: d.id, ...d.data() } as UserResult);
        }
      });

      if (!isHandle) {
        const displaySnap = await getDocs(
          query(
            collection(db, 'users'),
            where('displayName', '>=', raw),
            where('displayName', '<=', raw + '')
          )
        );
        displaySnap.docs.forEach((d) => {
          if (d.id !== uid && !seen.has(d.id)) {
            seen.add(d.id);
            combined.push({ id: d.id, ...d.data() } as UserResult);
          }
        });
      }

      if (seq !== searchSeq.current) return; // a newer search superseded this one
      const blocked = blockedRef.current;
      setResults(combined.filter((u) => !blocked.includes(u.id)));
    } catch {
      if (seq === searchSeq.current) {
        setResults([]);
        showToast('Search failed', 'error');
      }
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, [searchQuery, uid, showToast]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      searchSeq.current++; // cancel any in-flight result
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, runSearch]);

  // ── Tab pill ────────────────────────────────────────────────────────────────
  const animateTabPillTo = useCallback(
    (index: number) => {
      const layout = tabLayouts.current[index];
      if (!layout) return;
      Animated.parallel([
        Animated.spring(tabPillLeft, { toValue: layout.x, useNativeDriver: false, tension: 130, friction: 14 }),
        Animated.spring(tabPillWidth, { toValue: layout.width, useNativeDriver: false, tension: 130, friction: 14 }),
      ]).start();
    },
    [tabPillLeft, tabPillWidth]
  );

  const selectTab = useCallback(
    (t: Tab, index: number) => {
      setTab(t);
      animateTabPillTo(index);
      Haptics.selectionAsync();
    },
    [animateTabPillTo]
  );

  // ── Join by code ────────────────────────────────────────────────────────────
  const handleJoinByCode = useCallback(async () => {
    if (joiningByCode) return;
    const code = joinCode.trim().toUpperCase();
    if (code.length !== INVITE_CODE_LENGTH) {
      showToast(`Enter a valid ${INVITE_CODE_LENGTH}-character code`, 'error');
      return;
    }
    setJoiningByCode(true);
    try {
      // Joining (including private plans) goes through a Cloud Function. The
      // client can't read a private plan to find it by code, and security rules
      // only allow self-join to PUBLIC plans, so the function validates the code
      // and adds the caller server-side via the Admin SDK.
      const join = httpsCallable<{ code: string }, { planId: string }>(functions, 'joinPlanByCode');
      const { data } = await join({ code });
      setJoinCode('');
      showToast('Joined plan!');
      router.push({ pathname: '/plan-detail', params: { id: data.planId } });
    } catch (e: any) {
      showToast(e?.message || 'Something went wrong', 'error');
    } finally {
      setJoiningByCode(false);
    }
  }, [joinCode, joiningByCode, router, showToast]);

  // ── Friend request actions ──────────────────────────────────────────────────
  const sendFriendRequest = useCallback(
    async (toId: string, toName?: string) => {
      if (sendingRequest.current || sentRequests.has(toId)) return;
      sendingRequest.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSentRequests((prev) => new Set(prev).add(toId));
      try {
        const mySnap = await getDoc(doc(db, 'users', uid));
        const myName = mySnap.data()?.displayName || 'Someone';
        await updateDoc(doc(db, 'users', toId), {
          friendRequests: arrayUnion({ fromId: uid, fromName: myName }),
        });
        showToast(`Friend request sent to ${toName || 'user'}`);
      } catch {
        setSentRequests((prev) => {
          const next = new Set(prev);
          next.delete(toId);
          return next;
        });
        showToast('Failed to send request', 'error');
      } finally {
        sendingRequest.current = false;
      }
    },
    [sentRequests, uid, showToast]
  );

  const cancelRequest = useCallback(
    async (toId: string) => {
      try {
        const toSnap = await getDoc(doc(db, 'users', toId));
        const theirRequests: FriendRequest[] = toSnap.data()?.friendRequests || [];
        const exact = theirRequests.find((r) => r.fromId === uid);
        if (exact) {
          await updateDoc(doc(db, 'users', toId), { friendRequests: arrayRemove(exact) });
        }
        setSentRequests((prev) => {
          const next = new Set(prev);
          next.delete(toId);
          return next;
        });
        showToast('Request cancelled', 'info');
      } catch {
        showToast('Failed to cancel request', 'error');
      }
    },
    [uid, showToast]
  );

  const acceptRequest = useCallback(
    async (req: FriendRequest) => {
      try {
        await updateDoc(doc(db, 'users', uid), {
          friends: arrayUnion(req.fromId),
          friendRequests: arrayRemove(req),
        });
        await updateDoc(doc(db, 'users', req.fromId), { friends: arrayUnion(uid) });
        celebrate(confettiRef);
        showToast(`You and ${req.fromName} are now friends`);
      } catch {
        showToast('Failed to accept request', 'error');
      }
    },
    [uid, showToast, celebrate]
  );

  const declineRequest = useCallback(
    async (req: FriendRequest) => {
      try {
        await updateDoc(doc(db, 'users', uid), { friendRequests: arrayRemove(req) });
        showToast('Request declined', 'info');
      } catch {
        showToast('Failed to decline request', 'error');
      }
    },
    [uid, showToast]
  );

  const unfriend = useCallback(
    (friend: UserResult) => {
      Alert.alert('Unfriend', `Remove ${friend.displayName || 'this person'} from your friends?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', uid), { friends: arrayRemove(friend.id) });
              await updateDoc(doc(db, 'users', friend.id), { friends: arrayRemove(uid) });
            } catch {
              showToast('Failed to unfriend', 'error');
            }
          },
        },
      ]);
    },
    [uid, showToast]
  );

  const blockUser = useCallback(
    (user: UserResult) => {
      Alert.alert(
        'Block User',
        `Block ${user.displayName || 'this person'}? They won't be able to send you friend requests and won't appear in your searches.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              try {
                await updateDoc(doc(db, 'users', uid), {
                  blockedUsers: arrayUnion(user.id),
                  friends: arrayRemove(user.id),
                });
                // Remove any pending request from this user (exact-object removal).
                const pending = friendRequests.filter((r) => r.fromId === user.id);
                if (pending.length) {
                  await updateDoc(doc(db, 'users', uid), { friendRequests: arrayRemove(...pending) });
                }
                await updateDoc(doc(db, 'users', user.id), { friends: arrayRemove(uid) });
                setResults((prev) => prev.filter((u) => u.id !== user.id));
              } catch {
                showToast('Failed to block user', 'error');
              }
            },
          },
        ]
      );
    },
    [uid, friendRequests, showToast]
  );

  const unblockUser = useCallback(
    async (userId: string) => {
      try {
        await updateDoc(doc(db, 'users', uid), { blockedUsers: arrayRemove(userId) });
      } catch {
        showToast('Failed to unblock user', 'error');
      }
    },
    [uid, showToast]
  );

  const viewProfile = useCallback(
    (userId: string) => router.push({ pathname: '/user-profile', params: { userId } }),
    [router]
  );

  // ── Derived data ────────────────────────────────────────────────────────────
  const friendIdSet = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);
  const visibleFriends = useMemo(
    () => friends.filter((f) => !blockedUsers.includes(f.id)),
    [friends, blockedUsers]
  );

  // ── Renderers ───────────────────────────────────────────────────────────────
  const keyById = useCallback((u: UserResult) => u.id, []);
  const keyByFrom = useCallback((r: FriendRequest) => r.fromId, []);

  const renderSearchItem = useCallback(
    ({ item, index }: { item: UserResult; index: number }) => {
      const alreadyFriend = friendIdSet.has(item.id);
      const pending = sentRequests.has(item.id);
      return (
        <AnimatedCard index={index} accentColor={Colors.primary}>
          <View style={styles.userRow}>
            <TouchableOpacity
              style={styles.userTap}
              onPress={() => viewProfile(item.id)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.displayName || 'user'}'s profile`}
            >
              <Avatar name={item.displayName} />
              <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>
                  {item.displayName || 'Unknown'}
                </Text>
                {item.username ? <Text style={styles.userHandle} numberOfLines={1}>@{item.username}</Text> : null}
                {item.city ? (
                  <Text style={styles.userMeta} numberOfLines={1}>
                    {item.country ? `${item.city}, ${item.country}` : item.city}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
            {alreadyFriend ? (
              <Text style={styles.friendTag}>Connected</Text>
            ) : pending ? (
              <TouchableOpacity
                onPress={() => cancelRequest(item.id)}
                style={styles.pendingBtn}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Cancel friend request"
                hitSlop={HIT_SLOP}
              >
                <Text style={styles.pendingTag}>Pending</Text>
                <Ionicons name="close" size={14} color={Colors.textSecondary} style={styles.pendingClose} />
              </TouchableOpacity>
            ) : (
              <AnimatedButton
                label="Add"
                onPress={() => sendFriendRequest(item.id, item.displayName)}
                variant="ghost"
                size="sm"
                style={styles.addBtn}
              />
            )}
            <IconButton name="close-circle-outline" onPress={() => blockUser(item)} label="Block user" />
          </View>
        </AnimatedCard>
      );
    },
    [friendIdSet, sentRequests, viewProfile, cancelRequest, sendFriendRequest, blockUser]
  );

  const renderRequestItem = useCallback(
    ({ item, index }: { item: FriendRequest; index: number }) => (
      <AnimatedCard index={index} accentColor={Colors.primary}>
        <View style={styles.userRow}>
          <TouchableOpacity
            style={styles.userTap}
            onPress={() => viewProfile(item.fromId)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.fromName || 'user'}'s profile`}
          >
            <Avatar name={item.fromName} />
            <Text style={[styles.userName, styles.flexOne]} numberOfLines={1}>
              {item.fromName || 'Unknown'}
            </Text>
          </TouchableOpacity>
          <IconButton
            name="close-circle-outline"
            onPress={() => blockUser({ id: item.fromId, displayName: item.fromName })}
            label="Block user"
          />
          <AnimatedButton
            label="Decline"
            onPress={() => declineRequest(item)}
            variant="ghost"
            size="sm"
            style={styles.declineBtn}
            textStyle={styles.declineText}
          />
          <AnimatedButton
            label="Accept"
            onPress={() => acceptRequest(item)}
            variant="primary"
            size="sm"
            style={styles.acceptBtn}
          />
        </View>
      </AnimatedCard>
    ),
    [viewProfile, blockUser, declineRequest, acceptRequest]
  );

  const renderFriendItem = useCallback(
    ({ item, index }: { item: UserResult; index: number }) => (
      <AnimatedCard index={index} accentColor={Colors.gold}>
        <View style={styles.userRow}>
          <TouchableOpacity
            style={styles.userTap}
            onPress={() => viewProfile(item.id)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.displayName || 'friend'}'s profile`}
          >
            <Avatar
              name={item.displayName}
              online={isUserOnline(item)}
              tint={Colors.gold}
              tintBg={Colors.gold + '44'}
            />
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {item.displayName || 'Unknown'}
              </Text>
              {item.username ? <Text style={styles.userHandle} numberOfLines={1}>@{item.username}</Text> : null}
              {item.city ? <Text style={styles.userMeta} numberOfLines={1}>{item.city}</Text> : null}
            </View>
          </TouchableOpacity>
          <IconButton name="close-circle-outline" onPress={() => blockUser(item)} label="Block user" />
          <TouchableOpacity
            style={styles.unfriendBtn}
            onPress={() => unfriend(item)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.displayName || 'friend'}`}
            hitSlop={HIT_SLOP}
          >
            <Text style={styles.unfriendBtnText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </AnimatedCard>
    ),
    [viewProfile, blockUser, unfriend]
  );

  const blockedFooter = useMemo(() => {
    if (blockedProfiles.length === 0) return null;
    return (
      <View style={styles.blockedSection}>
        <Text style={styles.blockedSectionTitle}>Blocked Users</Text>
        {blockedProfiles.map((u) => (
          <View key={u.id} style={styles.blockedRow}>
            <Avatar name={u.displayName} tint={Colors.textSecondary} tintBg={Colors.surfaceOverlay} />
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {u.displayName || 'Unknown'}
              </Text>
              {u.username ? <Text style={styles.userHandle} numberOfLines={1}>@{u.username}</Text> : null}
            </View>
            <TouchableOpacity
              style={styles.unblockBtn}
              onPress={() => unblockUser(u.id)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`Unblock ${u.displayName || 'user'}`}
              hitSlop={HIT_SLOP}
            >
              <Text style={styles.unblockBtnText}>Unblock</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  }, [blockedProfiles, unblockUser]);

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconHit}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={HIT_SLOP}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Friends</Text>
        <TouchableOpacity
          onPress={() => selectTab('search', 1)}
          style={styles.iconHit}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Search for people"
          hitSlop={HIT_SLOP}
        >
          <Ionicons name="search-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <Animated.View style={[styles.tabPill, { left: tabPillLeft, width: tabPillWidth }]} />
        {TABS.map((t, i) => {
          const active = tab === t;
          return (
            <TouchableOpacity
              key={t}
              onLayout={(e) => {
                tabLayouts.current[i] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
                if (t === tab && !tabPillInitialized.current) {
                  tabPillLeft.setValue(e.nativeEvent.layout.x);
                  tabPillWidth.setValue(e.nativeEvent.layout.width);
                  tabPillInitialized.current = true;
                }
              }}
              onPress={() => selectTab(t, i)}
              style={styles.tab}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t === 'friends' ? 'Friends' : t === 'requests' ? 'Requests' : 'Search'}
            >
              <View style={styles.tabInner}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t === 'friends'
                    ? `Friends (${visibleFriends.length})`
                    : t === 'requests'
                    ? 'Requests'
                    : 'Search'}
                </Text>
                {t === 'requests' && friendRequests.length > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{friendRequests.length}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search tab */}
      {tab === 'search' && (
        <View style={styles.tabBody}>
          <View style={styles.joinCodeCard}>
            <View style={styles.joinCodeHeader}>
              <Ionicons name="key-outline" size={16} color={Colors.text} />
              <Text style={styles.joinCodeTitle}>Join by Invite Code</Text>
            </View>
            <Text style={styles.joinCodeSubtitle}>
              Enter the {INVITE_CODE_LENGTH}-character code someone shared to join their plan.
            </Text>
            <View style={styles.joinCodeRow}>
              <TextInput
                style={styles.joinCodeInput}
                placeholder="8-character code"
                placeholderTextColor={Colors.textMuted}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={INVITE_CODE_LENGTH}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleJoinByCode}
              />
              <TouchableOpacity
                style={[
                  styles.squareBtn,
                  (joiningByCode || joinCode.length !== INVITE_CODE_LENGTH) && styles.btnDisabled,
                ]}
                onPress={handleJoinByCode}
                disabled={joiningByCode}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Join plan by code"
                accessibilityState={{ disabled: joiningByCode, busy: joiningByCode }}
              >
                {joiningByCode ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Ionicons name="arrow-forward" size={20} color={Colors.background} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by @username or name"
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={runSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setSearchQuery('')}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={HIT_SLOP}
              >
                <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {searching && searchQuery.trim().length > 0 ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.searchSpinner} />
          ) : null}

          <FlatList
            data={results}
            keyExtractor={keyById}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={SEARCH_LIST_CONTENT}
            renderItem={renderSearchItem}
            removeClippedSubviews
            ListEmptyComponent={
              !searching && searchQuery.trim() ? (
                <EmptyState
                  icon="search-outline"
                  title="No users found"
                  hint="Try a different name or an exact @username."
                />
              ) : null
            }
          />
        </View>
      )}

      {/* Requests tab */}
      {tab === 'requests' && (
        <FlatList
          data={friendRequests}
          keyExtractor={keyByFrom}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={LIST_CONTENT}
          renderItem={renderRequestItem}
          removeClippedSubviews
          ListEmptyComponent={
            <EmptyState
              icon="mail-outline"
              title="No pending requests"
              hint="Friend requests you receive will show up here."
            />
          }
        />
      )}

      {/* Friends tab */}
      {tab === 'friends' && (
        <FlatList
          data={visibleFriends}
          keyExtractor={keyById}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={LIST_CONTENT}
          renderItem={renderFriendItem}
          removeClippedSubviews
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="No friends yet"
              hint="Use Search to find people by name or @username and send a request."
            />
          }
          ListFooterComponent={blockedFooter}
        />
      )}

      <ConfettiParticles ref={confettiRef} />
    </ScreenWrapper>
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
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: Fonts.headingBold,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    letterSpacing: -0.5,
    flex: 1,
    marginLeft: Spacing.sm,
  },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    position: 'relative',
  },
  tabPill: {
    position: 'absolute',
    top: 4,
    height: 36,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.full, zIndex: 1 },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  tabText: {
    fontSize: FontSize.sm,
    fontFamily: Fonts.bodySemibold,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: Colors.background,
    fontFamily: Fonts.bodyBold,
    fontWeight: FontWeight.bold,
  },

  badge: {
    backgroundColor: Colors.background,
    borderRadius: Radius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    fontVariant: ['tabular-nums'],
  },

  tabBody: { padding: Spacing.md, flex: 1 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: FontSize.md,
    fontFamily: Fonts.body,
  },
  clearBtn: { alignItems: 'center', justifyContent: 'center' },
  searchSpinner: { marginTop: Spacing.xs, marginBottom: Spacing.md },
  squareBtn: {
    width: 48,
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.4 },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  userTap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  userInfo: { flex: 1, gap: 2 },
  flexOne: { flex: 1 },

  avatarWrap: { position: 'relative' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontFamily: Fonts.headingSemibold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.lg,
  },
  // Online indicator: greyscale. A light ring punches the dot out of the
  // avatar/card so it reads as a status badge without relying on hue.
  presenceRing: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.text,
  },

  userName: {
    color: Colors.text,
    fontFamily: Fonts.bodySemibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  userHandle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontFamily: Fonts.bodyMedium,
    fontWeight: FontWeight.medium,
    lineHeight: 20,
  },
  userMeta: { color: Colors.textMuted, fontSize: FontSize.sm, lineHeight: 20 },

  friendTag: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    paddingHorizontal: Spacing.xs,
  },
  pendingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  pendingTag: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  pendingClose: { marginLeft: Spacing.xs },
  addBtn: { paddingHorizontal: Spacing.gutter, paddingVertical: 9 },

  declineBtn: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 9,
  },
  declineText: { color: Colors.textMuted, fontWeight: FontWeight.medium },
  acceptBtn: { paddingHorizontal: Spacing.gutter, paddingVertical: 9 },

  unfriendBtn: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  unfriendBtnText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  blockedSection: {
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderStrong,
    paddingTop: Spacing.md,
  },
  blockedSectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  unblockBtn: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  unblockBtnText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  emptyState: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    color: Colors.text,
    textAlign: 'center',
    fontFamily: Fonts.headingSemibold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.lg,
  },
  emptyHint: {
    color: Colors.textMuted,
    textAlign: 'center',
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.xs,
    maxWidth: 280,
  },

  joinCodeCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  joinCodeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  joinCodeTitle: {
    fontSize: FontSize.md,
    fontFamily: Fonts.bodyBold,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  joinCodeSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  joinCodeRow: { flexDirection: 'row', gap: Spacing.sm },
  joinCodeInput: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    letterSpacing: 6,
    textAlign: 'center',
  },
});
