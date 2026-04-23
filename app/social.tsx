import React, { useState, useEffect, useRef } from 'react';
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
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import AnimatedCard from '../components/AnimatedCard';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

type UserResult = { id: string; displayName: string; username?: string; city?: string; country?: string; lastActive?: any };
type FriendRequest = { id: string; fromId: string; fromName: string };

export default function SocialScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<UserResult[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<UserResult[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'search' | 'requests' | 'friends'>('friends');
  const [joinCode, setJoinCode] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const uid = auth.currentUser?.uid || '';
  const { showToast } = useToast();

  const tabLayouts = useRef<Array<{ x: number; width: number }>>([]);
  const tabPillLeft = useRef(new Animated.Value(0)).current;
  const tabPillWidth = useRef(new Animated.Value(0)).current;
  const tabPillInitialized = useRef(false);
  const sendingRequest = useRef(false);

  const TABS = ['friends', 'search', 'requests'] as const;

  const animateTabPillTo = (index: number) => {
    const layout = tabLayouts.current[index];
    if (!layout) return;
    Animated.parallel([
      Animated.spring(tabPillLeft, { toValue: layout.x, useNativeDriver: false, tension: 130, friction: 14 }),
      Animated.spring(tabPillWidth, { toValue: layout.width, useNativeDriver: false, tension: 130, friction: 14 }),
    ]).start();
  };

  // Mark current user as online when viewing Social
  useEffect(() => {
    if (!uid) return;
    updateDoc(doc(db, 'users', uid), { lastActive: serverTimestamp() }).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), async (snap) => {
      const data = snap.data();
      const requests: FriendRequest[] = (data?.friendRequests || []).map((r: any) => r);
      setFriendRequests(requests);
      const blocked: string[] = data?.blockedUsers || [];
      setBlockedUsers(blocked);

      // Fetch blocked user profiles for display
      if (blocked.length > 0) {
        const blockedDocs = await Promise.all(blocked.map((id) => getDoc(doc(db, 'users', id))));
        setBlockedProfiles(
          blockedDocs
            .filter((d) => d.exists())
            .map((d) => ({ id: d.id, ...d.data() } as UserResult))
        );
      } else {
        setBlockedProfiles([]);
      }

      const friendIds: string[] = data?.friends || [];
      if (friendIds.length > 0) {
        const friendDocs = await Promise.all(friendIds.map((id) => getDoc(doc(db, 'users', id))));
        const sorted = friendDocs
          .filter((d) => d.exists())
          .map((d) => ({ id: d.id, ...d.data() } as UserResult))
          .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        setFriends(sorted);
      } else {
        setFriends([]);
      }
    });
    return unsub;
  }, [uid]);

  const handleJoinByCode = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length !== 6) { showToast('Enter a valid 6-character code', 'error'); return; }
    setJoiningByCode(true);
    try {
      const snap = await getDocs(query(collection(db, 'plans'), where('inviteCode', '==', code)));
      if (snap.empty) { showToast('Invalid code — plan not found', 'error'); return; }
      const planDoc = snap.docs[0];
      const planData = planDoc.data();
      if (planData.participants?.includes(uid)) {
        router.push({ pathname: '/plan-detail', params: { id: planDoc.id } });
        return;
      }
      if (planData.maxParticipants && (planData.participants?.length || 0) >= planData.maxParticipants) {
        showToast('This plan is full', 'error'); return;
      }
      await updateDoc(doc(db, 'plans', planDoc.id), { participants: arrayUnion(uid) });
      showToast('Joined plan!');
      router.push({ pathname: '/plan-detail', params: { id: planDoc.id } });
    } catch {
      showToast('Something went wrong', 'error');
    } finally {
      setJoiningByCode(false);
      setJoinCode('');
    }
  };

  // Debounced real-time search as user types
  useEffect(() => {
    if (!searchQuery.trim()) { setResults([]); return; }
    const timer = setTimeout(() => { handleSearch(); }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const raw = searchQuery.trim();
    const isHandle = raw.startsWith('@');
    const term = raw.replace(/^@/, '').toLowerCase();

    const seen = new Set<string>();
    const combined: UserResult[] = [];

    const usernameSnap = await getDocs(query(
      collection(db, 'users'),
      where('usernameLower', '>=', term),
      where('usernameLower', '<=', term + '\uf8ff')
    ));
    usernameSnap.docs.forEach((d) => {
      if (d.id !== uid) { seen.add(d.id); combined.push({ id: d.id, ...d.data() } as UserResult); }
    });

    if (!isHandle) {
      const displaySnap = await getDocs(query(
        collection(db, 'users'),
        where('displayName', '>=', raw),
        where('displayName', '<=', raw + '\uf8ff')
      ));
      displaySnap.docs.forEach((d) => {
        if (d.id !== uid && !seen.has(d.id)) combined.push({ id: d.id, ...d.data() } as UserResult);
      });
    }

    // Filter out blocked users from results
    setResults(combined.filter((u) => !blockedUsers.includes(u.id)));
    setSearching(false);
  };

  const sendFriendRequest = async (toId: string, toName: string) => {
    if (sendingRequest.current) return;
    if (sentRequests.has(toId)) return;
    sendingRequest.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSentRequests((prev) => new Set(prev).add(toId));
    try {
      const mySnap = await getDoc(doc(db, 'users', uid));
      const myName = mySnap.data()?.displayName || 'Someone';
      await updateDoc(doc(db, 'users', toId), {
        friendRequests: arrayUnion({ fromId: uid, fromName: myName }),
      });
      showToast(`Friend request sent to ${toName}!`);
    } catch {
      setSentRequests((prev) => { const next = new Set(prev); next.delete(toId); return next; });
      showToast('Failed to send request', 'error');
    } finally {
      sendingRequest.current = false;
    }
  };

  const cancelRequest = async (toId: string) => {
    try {
      const toSnap = await getDoc(doc(db, 'users', toId));
      const theirRequests = (toSnap.data()?.friendRequests || []).filter((r: any) => r.fromId !== uid);
      await updateDoc(doc(db, 'users', toId), { friendRequests: theirRequests });
      setSentRequests((prev) => { const next = new Set(prev); next.delete(toId); return next; });
      showToast('Request cancelled', 'info');
    } catch {
      showToast('Failed to cancel request', 'error');
    }
  };

  const acceptRequest = async (req: FriendRequest) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await updateDoc(doc(db, 'users', uid), {
        friends: arrayUnion(req.fromId),
        friendRequests: friendRequests.filter((r) => r.fromId !== req.fromId),
      });
      await updateDoc(doc(db, 'users', req.fromId), { friends: arrayUnion(uid) });
      showToast(`You and ${req.fromName} are now friends!`);
    } catch {
      showToast('Failed to accept request', 'error');
    }
  };

  const declineRequest = async (req: FriendRequest) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        friendRequests: friendRequests.filter((r) => r.fromId !== req.fromId),
      });
      showToast('Request declined', 'info');
    } catch {
      showToast('Failed to decline request', 'error');
    }
  };

  const unfriend = (friend: UserResult) => {
    Alert.alert('Unfriend', `Remove ${friend.displayName} from your friends?`, [
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
  };

  const blockUser = (user: UserResult) => {
    Alert.alert(
      'Block User',
      `Block ${user.displayName}? They won't be able to send you friend requests and won't appear in your searches.`,
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
                friendRequests: friendRequests.filter((r) => r.fromId !== user.id),
              });
              await updateDoc(doc(db, 'users', user.id), { friends: arrayRemove(uid) });
              setResults((prev) => prev.filter((u) => u.id !== user.id));
            } catch {
              showToast('Failed to block user', 'error');
            }
          },
        },
      ]
    );
  };

  const unblockUser = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { blockedUsers: arrayRemove(userId) });
    } catch {
      showToast('Failed to unblock user', 'error');
    }
  };

  const viewProfile = (userId: string) => router.push({ pathname: '/user-profile', params: { userId } } as any);

  const isFriend = (userId: string) => friends.some((f) => f.id === userId);
  const isBlocked = (userId: string) => blockedUsers.includes(userId);
  const isOnline = (user: UserResult) => {
    if (!user.lastActive) return false;
    const lastSeen = user.lastActive?.toDate?.() || new Date(user.lastActive);
    return Date.now() - lastSeen.getTime() < 5 * 60 * 1000; // 5 minutes
  };

  const visibleFriends = friends.filter((f) => !blockedUsers.includes(f.id));

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Friends</Text>
        <TouchableOpacity
          onPress={() => { setTab('search'); setShowSearch(true); Haptics.selectionAsync(); }}
          style={styles.searchIconBtn}
        >
          <Ionicons name="search-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <Animated.View style={[styles.tabPill, { left: tabPillLeft, width: tabPillWidth }]} />
        {TABS.map((t, i) => (
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
            onPress={() => { setTab(t); animateTabPillTo(i); Haptics.selectionAsync(); }}
            style={styles.tab}
          >
            <View style={styles.tabInner}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'friends' ? `Friends (${visibleFriends.length})` :
                 t === 'requests' ? 'Requests' : 'Search'}
              </Text>
              {t === 'requests' && friendRequests.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{friendRequests.length}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search tab */}
      {tab === 'search' && (
        <View style={{ padding: Spacing.md, flex: 1 }}>
          {/* Join by Code */}
          <View style={styles.joinCodeCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Ionicons name="key-outline" size={16} color={Colors.primary} />
              <Text style={styles.joinCodeTitle}>Join by Invite Code</Text>
            </View>
            <View style={styles.joinCodeRow}>
              <TextInput
                style={styles.joinCodeInput}
                placeholder="Enter 6-character code"
                placeholderTextColor={Colors.textMuted}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={6}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.joinCodeBtn, joiningByCode && { opacity: 0.7 }]}
                onPress={handleJoinByCode}
                disabled={joiningByCode}
              >
                {joiningByCode
                  ? <Ionicons name="hourglass-outline" size={18} color={Colors.text} />
                  : <Ionicons name="arrow-forward" size={18} color={Colors.text} />
                }
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
              onChangeText={(text) => {
                setSearchQuery(text);
                if (text.trim().length > 0) setSearching(true);
                else setSearching(false);
              }}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
              <Ionicons name="arrow-forward" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
          {searching && searchQuery.trim().length > 0 && (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 16 }} />
          )}
          <FlatList
            data={results}
            keyExtractor={(u) => u.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const alreadyFriend = isFriend(item.id);
              const pending = sentRequests.has(item.id);
              return (
                <AnimatedCard index={index} accentColor={Colors.primary}>
                  <View style={styles.userRow}>
                    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }} onPress={() => viewProfile(item.id)}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{(item.displayName || '?')[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userName}>{item.displayName}</Text>
                        {item.username && <Text style={styles.userHandle}>@{item.username}</Text>}
                        {item.city && <Text style={styles.userMeta}>{item.city}, {item.country}</Text>}
                      </View>
                    </TouchableOpacity>
                    {alreadyFriend ? (
                      <Text style={styles.friendTag}>✓ Friends</Text>
                    ) : pending ? (
                      <TouchableOpacity onPress={() => cancelRequest(item.id)} style={styles.pendingBtn}>
                        <Text style={styles.pendingTag}>Pending</Text>
                        <Ionicons name="close" size={12} color={Colors.textMuted} style={{ marginLeft: 3 }} />
                      </TouchableOpacity>
                    ) : (
                      <AnimatedButton
                        label="Add"
                        onPress={() => sendFriendRequest(item.id, item.displayName)}
                        variant="ghost"
                        style={{ paddingHorizontal: 14, paddingVertical: 6 }}
                        textStyle={{ fontSize: FontSize.sm }}
                      />
                    )}
                    <TouchableOpacity
                      style={styles.blockBtn}
                      onPress={() => blockUser(item)}
                    >
                      <Ionicons name="close-circle-outline" size={22} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </AnimatedCard>
              );
            }}
            ListEmptyComponent={
              !searching && searchQuery.trim() ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={56} color={Colors.textMuted} style={{ marginBottom: 12 }} />
                  <Text style={styles.emptyText}>No users found</Text>
                </View>
              ) : null
            }
          />
        </View>
      )}

      {/* Requests tab */}
      {tab === 'requests' && (
        <FlatList
          data={friendRequests}
          keyExtractor={(r) => r.fromId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
          renderItem={({ item, index }) => (
            <AnimatedCard index={index} accentColor={Colors.primary}>
              <View style={styles.userRow}>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }} onPress={() => viewProfile(item.fromId)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(item.fromName || '?')[0].toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.userName, { flex: 1 }]}>{item.fromName}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.blockBtn}
                  onPress={() => blockUser({ id: item.fromId, displayName: item.fromName })}
                >
                  <Ionicons name="close-circle-outline" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <AnimatedButton
                  label="Decline"
                  onPress={() => declineRequest(item)}
                  variant="ghost"
                  style={{ paddingHorizontal: 10, paddingVertical: 6 }}
                  textStyle={{ fontSize: FontSize.sm, color: Colors.textMuted }}
                />
                <AnimatedButton
                  label="Accept"
                  onPress={() => acceptRequest(item)}
                  variant="primary"
                  style={{ paddingHorizontal: 14, paddingVertical: 6 }}
                  textStyle={{ fontSize: FontSize.sm }}
                />
              </View>
            </AnimatedCard>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="mail-outline" size={56} color={Colors.textMuted} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyText}>No pending requests</Text>
            </View>
          }
        />
      )}

      {/* Friends tab */}
      {tab === 'friends' && (
        <FlatList
          data={visibleFriends}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
          renderItem={({ item, index }) => (
            <AnimatedCard index={index} accentColor={Colors.gold}>
              <View style={styles.userRow}>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }} onPress={() => viewProfile(item.id)}>
                  <View style={{ position: 'relative' }}>
                    <View style={[styles.avatar, { backgroundColor: Colors.gold + '44' }]}>
                      <Text style={[styles.avatarText, { color: Colors.gold }]}>{(item.displayName || '?')[0].toUpperCase()}</Text>
                    </View>
                    {isOnline(item) && <View style={styles.presenceDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{item.displayName}</Text>
                    {item.username && <Text style={styles.userHandle}>@{item.username}</Text>}
                    {item.city && <Text style={styles.userMeta}>{item.city}</Text>}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.blockBtn}
                  onPress={() => blockUser(item)}
                >
                  <Ionicons name="close-circle-outline" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.unfriendBtn}
                  onPress={() => unfriend(item)}
                >
                  <Text style={styles.unfriendBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </AnimatedCard>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={56} color={Colors.textMuted} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyText}>No friends yet — search to add some!</Text>
            </View>
          }
          ListFooterComponent={
            blockedProfiles.length > 0 ? (
              <View style={styles.blockedSection}>
                <Text style={styles.blockedSectionTitle}>Blocked Users</Text>
                {blockedProfiles.map((u) => (
                  <View key={u.id} style={styles.blockedRow}>
                    <View style={[styles.avatar, { backgroundColor: Colors.error + '22' }]}>
                      <Text style={[styles.avatarText, { color: Colors.error }]}>{(u.displayName || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{u.displayName}</Text>
                      {u.username && <Text style={styles.userHandle}>@{u.username}</Text>}
                    </View>
                    <TouchableOpacity
                      style={styles.unblockBtn}
                      onPress={() => unblockUser(u.id)}
                    >
                      <Text style={styles.unblockBtnText}>Unblock</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null
          }
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
    borderBottomColor: Colors.glassBorder,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.5, flex: 1, marginLeft: Spacing.sm },
  searchIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: 4,
    position: 'relative',
  },
  tabPill: {
    position: 'absolute',
    top: 4,
    height: 34,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: Radius.full,
    zIndex: 1,
  },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: Colors.text, fontWeight: '700' },
  badge: {
    backgroundColor: Colors.error,
    borderRadius: 99,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: Colors.text, fontSize: 10, fontWeight: '800' },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md, alignItems: 'center' },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: FontSize.md,
  },
  searchBtn: {
    width: 48,
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.md },
  presenceDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: Colors.success,
    borderWidth: 2, borderColor: Colors.surfaceRaised,
  },
  userName: { color: Colors.text, fontWeight: '600', fontSize: FontSize.md },
  userHandle: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '500' },
  userMeta: { color: Colors.textMuted, fontSize: FontSize.sm },
  friendTag: { color: Colors.success, fontSize: FontSize.sm, fontWeight: '600' },
  pendingBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, borderWidth: 1, borderColor: Colors.glassBorder },
  pendingTag: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: '600' },
  unfriendBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  unfriendBtnText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  blockBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedSection: {
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
    paddingTop: Spacing.md,
  },
  blockedSectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
  },
  unblockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.primary + '66',
    backgroundColor: Colors.primary + '11',
  },
  unblockBtnText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  emptyText: { color: Colors.textMuted, textAlign: 'center', marginTop: 32, fontSize: FontSize.md },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 4 },
  joinCodeCard: {
    backgroundColor: Colors.surfaceRaised, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.glassBorder, padding: Spacing.md, marginBottom: Spacing.md,
  },
  joinCodeTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  joinCodeRow: { flexDirection: 'row', gap: 8 },
  joinCodeInput: {
    flex: 1, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.primary + '44',
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 11,
    color: Colors.primary, fontSize: FontSize.lg, fontWeight: '800', letterSpacing: 4,
    textAlign: 'center',
  },
  joinCodeBtn: {
    width: 48, height: 48, backgroundColor: Colors.primary,
    borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
  },
});
