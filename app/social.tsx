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
import { auth, db } from '../lib/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import AnimatedCard from '../components/AnimatedCard';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

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
      {online ? <View style={styles.presenceDot} /> : null}
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
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={56} color={Colors.textMuted} style={styles.emptyIcon} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
});

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const LIST_CONTENT = { padding: Spacing.md, paddingBottom: 100 };

export default function SocialScreen() {
  const router = useRouter();
  const { showToast } = useToast();

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
  const tabLayouts = useRef<Array<{ x: number; width: number }>>([]);
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
        setFriendRequests(requests);

        const blocked: string[] = Array.isArray(data.blockedUsers) ? data.blockedUsers : [];
        setBlockedUsers(blocked);

        try {
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
      const snap = await getDocs(query(collection(db, 'plans'), where('inviteCode', '==', code)));
      if (snap.empty) {
        showToast('Invalid code — plan not found', 'error');
        return;
      }
      const planDoc = snap.docs[0];
      const planData = planDoc.data();
      const participants: string[] = Array.isArray(planData.participants) ? planData.participants : [];
      if (participants.includes(uid)) {
        router.push({ pathname: '/plan-detail', params: { id: planDoc.id } });
        return;
      }
      if (planData.maxParticipants && participants.length >= planData.maxParticipants) {
        showToast('This plan is full', 'error');
        return;
      }
      await updateDoc(doc(db, 'plans', planDoc.id), { participants: arrayUnion(uid) });
      setJoinCode('');
      showToast('Joined plan!');
      router.push({ pathname: '/plan-detail', params: { id: planDoc.id } });
    } catch {
      showToast('Something went wrong', 'error');
    } finally {
      setJoiningByCode(false);
    }
  }, [joinCode, joiningByCode, uid, router, showToast]);

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      try {
        await updateDoc(doc(db, 'users', uid), {
          friends: arrayUnion(req.fromId),
          friendRequests: arrayRemove(req),
        });
        await updateDoc(doc(db, 'users', req.fromId), { friends: arrayUnion(uid) });
        showToast(`You and ${req.fromName} are now friends`);
      } catch {
        showToast('Failed to accept request', 'error');
      }
    },
    [uid, showToast]
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
                accessibilityRole="button"
                accessibilityLabel="Cancel friend request"
                hitSlop={HIT_SLOP}
              >
                <Text style={styles.pendingTag}>Pending</Text>
                <Ionicons name="close" size={12} color={Colors.textMuted} style={styles.pendingClose} />
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
                style={[styles.squareBtn, joiningByCode && styles.btnDisabled]}
                onPress={handleJoinByCode}
                disabled={joiningByCode}
                accessibilityRole="button"
                accessibilityLabel="Join plan by code"
              >
                {joiningByCode ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="arrow-forward" size={18} color="#ffffff" />
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
                style={styles.squareBtn}
                onPress={() => setSearchQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close" size={18} color="#ffffff" />
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
            renderItem={renderSearchItem}
            removeClippedSubviews
            ListEmptyComponent={
              !searching && searchQuery.trim() ? (
                <EmptyState icon="search-outline" text="No users found" />
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
          ListEmptyComponent={<EmptyState icon="mail-outline" text="No pending requests" />}
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
          ListEmptyComponent={<EmptyState icon="people-outline" text="No friends yet — search to add some" />}
          ListFooterComponent={blockedFooter}
        />
      )}
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
    marginVertical: Spacing.sm,
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
    height: 34,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.full, zIndex: 1 },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  tabTextActive: { color: '#ffffff', fontWeight: FontWeight.bold },

  badge: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: Colors.primary, fontSize: 10, fontWeight: FontWeight.heavy },

  tabBody: { padding: Spacing.md, flex: 1 },

  searchRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md, alignItems: 'center' },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: FontSize.md,
  },
  searchSpinner: { marginVertical: Spacing.md },
  squareBtn: {
    width: 48,
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.7 },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  userTap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  userInfo: { flex: 1 },
  flexOne: { flex: 1 },

  avatarWrap: { position: 'relative' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.text, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  presenceDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.surfaceRaised,
  },

  userName: { color: Colors.text, fontWeight: FontWeight.semibold, fontSize: FontSize.md },
  userHandle: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  userMeta: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },

  friendTag: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  pendingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pendingTag: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  pendingClose: { marginLeft: 3 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 6 },

  declineBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  declineText: { color: Colors.textMuted },
  acceptBtn: { paddingHorizontal: 14, paddingVertical: 6 },

  unfriendBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unfriendBtnText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  blockedSection: {
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  blockedSectionTitle: {
    fontSize: 11,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  unblockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  unblockBtnText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 4 },
  emptyIcon: { marginBottom: 12 },
  emptyText: { color: Colors.textMuted, textAlign: 'center', marginTop: 32, fontSize: FontSize.md },

  joinCodeCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  joinCodeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  joinCodeTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  joinCodeRow: { flexDirection: 'row', gap: 8 },
  joinCodeInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    letterSpacing: 4,
    textAlign: 'center',
  },
});
