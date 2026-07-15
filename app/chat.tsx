import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  ListRenderItemInfo,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { hasScamKeywords } from '../lib/scamDetection';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  where,
  Timestamp,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { getChatHistoryCutoff } from '../lib/subscription';
import { useSubscription } from '../hooks/useSubscription';
import { useToast } from '../components/Toast';
import ScreenWrapper from '../components/ScreenWrapper';
import { SkeletonChatBubble } from '../components/SkeletonLoader';
import { Colors, Fonts, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

const REACTION_EMOJIS = ['+1', 'love', 'haha', 'wow', 'sad', 'fire'] as const;

// How long a typing signal is considered "active" before it is ignored.
const TYPING_ACTIVE_MS = 4000;
// Debounce before the local user's typing signal is cleared from the room doc.
const TYPING_CLEAR_MS = 3500;

type Reactions = { [emoji: string]: string[] };

type Message = {
  id: string;
  text?: string;
  type?: 'text' | 'image';
  imageUrl?: string;
  senderId: string;
  senderName: string;
  timestamp?: Timestamp | null;
  reactions?: Reactions;
};

type Participant = { id: string; displayName: string; username?: string };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function renderTextWithMentions(text: string, isOwn: boolean) {
  const parts = text.split(/(@\w+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <Text key={i} style={[styles.mentionText, isOwn && styles.mentionTextOwn]}>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </>
  );
}

function formatTime(ts?: Timestamp | null): string {
  const date = ts?.toDate?.() ?? null;
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initialOf(name?: string): string {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing indicator
// ─────────────────────────────────────────────────────────────────────────────

function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -4, duration: 220, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 220, useNativeDriver: true }),
          Animated.delay(420),
        ])
      );
    const animations = [bounce(dot1, 0), bounce(dot2, 150), bounce(dot3, 300)];
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingDots}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat bubble (memoized so the inverted list only re-renders changed rows)
// ─────────────────────────────────────────────────────────────────────────────

type ChatBubbleProps = {
  message: Message;
  isOwn: boolean;
  index: number;
  myUid: string;
  roomId: string;
  onLongPress: (msg: Message) => void;
};

const ChatBubble = memo(function ChatBubble({
  message,
  isOwn,
  index,
  myUid,
  roomId,
  onLongPress,
}: ChatBubbleProps) {
  const slideX = useRef(new Animated.Value(isOwn ? 40 : -40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = Math.min(index * 30, 300);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, delay, useNativeDriver: true }),
      Animated.spring(slideX, { toValue: 0, tension: 80, friction: 10, delay, useNativeDriver: true }),
    ]).start();
    // Run once on mount only — re-animating on prop changes would be jarring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleReaction = useCallback(
    async (emoji: string) => {
      if (!myUid) return;
      const reactionRef = doc(db, 'chats', roomId, 'messages', message.id);
      const alreadyReacted = message.reactions?.[emoji]?.includes(myUid);
      try {
        await updateDoc(reactionRef, {
          [`reactions.${emoji}`]: alreadyReacted ? arrayRemove(myUid) : arrayUnion(myUid),
        });
      } catch {
        // Reaction is best-effort; ignore transient write failures.
      }
    },
    [message.id, message.reactions, myUid, roomId]
  );

  const handleLongPress = useCallback(() => onLongPress(message), [message, onLongPress]);

  const activeReactions = useMemo(
    () =>
      message.reactions
        ? Object.entries(message.reactions).filter(([, uids]) => uids.length > 0)
        : [],
    [message.reactions]
  );

  const timeLabel = formatTime(message.timestamp);

  return (
    <Animated.View
      style={[
        styles.bubbleContainer,
        isOwn ? styles.ownBubbleContainer : styles.otherBubbleContainer,
        { opacity, transform: [{ translateX: slideX }] },
      ]}
    >
      {!isOwn && (
        <View style={styles.senderAvatar}>
          <Text style={styles.senderAvatarText}>{initialOf(message.senderName)}</Text>
        </View>
      )}
      <View style={styles.bubbleColumn}>
        <TouchableOpacity activeOpacity={0.85} onLongPress={handleLongPress} delayLongPress={350}>
          <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
            {!isOwn && <Text style={styles.senderName}>{message.senderName}</Text>}
            {message.type === 'image' && message.imageUrl ? (
              <Image source={{ uri: message.imageUrl }} style={styles.chatImage} resizeMode="cover" />
            ) : (
              <Text style={[styles.bubbleText, isOwn && styles.ownBubbleText]}>
                {renderTextWithMentions(message.text ?? '', isOwn)}
              </Text>
            )}
            {!!timeLabel && (
              <Text style={[styles.timestamp, isOwn && styles.ownTimestamp]}>{timeLabel}</Text>
            )}
          </View>
        </TouchableOpacity>

        {activeReactions.length > 0 && (
          <View style={[styles.reactionsRow, isOwn && styles.reactionsRowOwn]}>
            {activeReactions.map(([emoji, uids]) => {
              const mine = uids.includes(myUid);
              return (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => toggleReaction(emoji)}
                  style={[styles.reactionPill, mine && styles.reactionPillActive]}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${emoji} reaction, ${uids.length}${
                    mine ? ', selected' : ''
                  }`}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={styles.reactionCount}>{uids.length}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const router = useRouter();
  const { planId, planTitle } = useLocalSearchParams<{ planId?: string; planTitle?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [input, setInput] = useState('');
  const [senderName, setSenderName] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reactionPickerMsg, setReactionPickerMsg] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [typingNames, setTypingNames] = useState<Record<string, string>>({});
  const flatListRef = useRef<FlatList<Message>>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();
  const uid = auth.currentUser?.uid || '';
  const { isPro } = useSubscription();

  const ROOM_ID = planId || 'global';
  const headerTitle = planTitle ? `${planTitle}` : 'Global Chat';

  // ── Messages + typing subscriptions ───────────────────────────────────────
  useEffect(() => {
    if (uid) {
      getDoc(doc(db, 'users', uid))
        .then((snap) => setSenderName(snap.data()?.displayName || 'Anonymous'))
        .catch(() => setSenderName('Anonymous'));
    }

    const cutoff = getChatHistoryCutoff(isPro ? 'pro' : 'free');
    const q = cutoff
      ? query(
          collection(db, 'chats', ROOM_ID, 'messages'),
          where('timestamp', '>=', Timestamp.fromDate(cutoff)),
          orderBy('timestamp', 'asc'),
          limit(100)
        )
      : query(
          collection(db, 'chats', ROOM_ID, 'messages'),
          orderBy('timestamp', 'asc'),
          limit(200)
        );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
        setLoadingMessages(false);
      },
      () => setLoadingMessages(false)
    );

    // Listen to typing indicators on the room doc.
    const roomRef = doc(db, 'chats', ROOM_ID);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      const typing = snap.data()?.typing as Record<string, number> | undefined;
      if (!typing) {
        setTypingUsers([]);
        return;
      }
      const now = Date.now();
      const activeTypers = Object.entries(typing)
        .filter(([id, ts]) => id !== uid && now - ts < TYPING_ACTIVE_MS)
        .map(([id]) => id);
      setTypingUsers((prev) =>
        prev.length === activeTypers.length && prev.every((id, i) => id === activeTypers[i])
          ? prev
          : activeTypers
      );
    });

    return () => {
      unsub();
      unsubRoom();
      // Clear own typing on unmount.
      if (uid) {
        updateDoc(doc(db, 'chats', ROOM_ID), { [`typing.${uid}`]: deleteField() }).catch(() => {});
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
    // ROOM_ID derives from planId; isPro/uid changes should rebuild the query.
  }, [ROOM_ID, isPro, uid]);

  // ── Resolve display names for typing users ─────────────────────────────────
  useEffect(() => {
    const unknown = typingUsers.filter((id) => !typingNames[id]);
    if (unknown.length === 0) return;
    let cancelled = false;
    Promise.all(unknown.map((id) => getDoc(doc(db, 'users', id))))
      .then((docs) => {
        if (cancelled) return;
        const newNames: Record<string, string> = {};
        docs.forEach((d) => {
          if (d.exists()) newNames[d.id] = d.data()?.displayName || 'Someone';
        });
        if (Object.keys(newNames).length) {
          setTypingNames((prev) => ({ ...prev, ...newNames }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [typingUsers, typingNames]);

  // ── Fetch plan participants for @mention ───────────────────────────────────
  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    getDoc(doc(db, 'plans', planId))
      .then(async (snap) => {
        const participantIds: string[] = snap.data()?.participants || [];
        const others = participantIds.filter((id) => id !== uid);
        const docs = await Promise.all(others.map((id) => getDoc(doc(db, 'users', id))));
        if (cancelled) return;
        setParticipants(
          docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() } as Participant))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [planId, uid]);

  // ── Typing broadcast ───────────────────────────────────────────────────────
  const broadcastTyping = useCallback(() => {
    if (!uid) return;
    setDoc(doc(db, 'chats', ROOM_ID), { typing: { [uid]: Date.now() } }, { merge: true }).catch(
      () => {}
    );
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      updateDoc(doc(db, 'chats', ROOM_ID), { [`typing.${uid}`]: deleteField() }).catch(() => {});
    }, TYPING_CLEAR_MS);
  }, [ROOM_ID, uid]);

  const clearTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (!uid) return;
    updateDoc(doc(db, 'chats', ROOM_ID), { [`typing.${uid}`]: deleteField() }).catch(() => {});
  }, [ROOM_ID, uid]);

  const handleInputChange = useCallback(
    (text: string) => {
      setInput(text);
      if (text.trim()) broadcastTyping();
      else clearTyping();
      const lastAt = text.lastIndexOf('@');
      if (lastAt !== -1) {
        const afterAt = text.slice(lastAt + 1);
        if (/^\w*$/.test(afterAt)) {
          setMentionQuery(afterAt);
          return;
        }
      }
      setMentionQuery(null);
    },
    [broadcastTyping, clearTyping]
  );

  const selectMention = useCallback(
    (p: Participant) => {
      const name = p.username || p.displayName.replace(/\s+/g, '');
      setInput((prev) => {
        const lastAt = prev.lastIndexOf('@');
        if (lastAt === -1) return prev;
        return prev.slice(0, lastAt) + '@' + name + ' ';
      });
      setMentionQuery(null);
      Haptics.selectionAsync();
    },
    []
  );

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return participants.filter(
      (p) =>
        (p.displayName || '').toLowerCase().startsWith(q) ||
        (p.username || '').toLowerCase().startsWith(q)
    );
  }, [mentionQuery, participants]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !uid) return;

    const actualSend = async () => {
      setInput('');
      setMentionQuery(null);
      clearTyping();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        await addDoc(collection(db, 'chats', ROOM_ID, 'messages'), {
          text,
          type: 'text',
          senderId: uid,
          senderName: senderName || 'Anonymous',
          timestamp: serverTimestamp(),
        });
      } catch {
        setInput(text);
        showToast('Failed to send message', 'error');
      }
    };

    if (hasScamKeywords(text)) {
      Alert.alert(
        'Possible scam detected',
        'Your message mentions payment or money transfers. Are you sure you want to send this?',
        [
          { text: 'Send Anyway', onPress: () => actualSend() },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } else {
      await actualSend();
    }
  }, [ROOM_ID, clearTyping, input, senderName, showToast, uid]);

  const handleImageSend = useCallback(async () => {
    if (!uid || uploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const uri = result.assets[0].uri;
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const randomId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const storageRef = ref(storage, `chat-media/${ROOM_ID}/${randomId}.jpg`);
      await uploadBytes(storageRef, blob);
      const imageUrl = await getDownloadURL(storageRef);
      await addDoc(collection(db, 'chats', ROOM_ID, 'messages'), {
        type: 'image',
        imageUrl,
        senderId: uid,
        senderName: senderName || auth.currentUser?.displayName || 'User',
        timestamp: serverTimestamp(),
      });
    } catch {
      showToast('Failed to send image', 'error');
    } finally {
      setUploading(false);
    }
  }, [ROOM_ID, senderName, showToast, uid, uploading]);

  const handleLongPress = useCallback((msg: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReactionPickerMsg(msg);
  }, []);

  const handleReactionSelect = useCallback(
    async (emoji: string) => {
      const msg = reactionPickerMsg;
      if (!msg || !uid) return;
      setReactionPickerMsg(null);
      const alreadyReacted = msg.reactions?.[emoji]?.includes(uid);
      const reactionRef = doc(db, 'chats', ROOM_ID, 'messages', msg.id);
      try {
        await updateDoc(reactionRef, {
          [`reactions.${emoji}`]: alreadyReacted ? arrayRemove(uid) : arrayUnion(uid),
        });
      } catch {
        // Best-effort reaction write.
      }
    },
    [ROOM_ID, reactionPickerMsg, uid]
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      try {
        await deleteDoc(doc(db, 'chats', ROOM_ID, 'messages', id));
      } catch {
        showToast('Failed to delete message', 'error');
      }
    },
    [ROOM_ID, showToast]
  );

  const handlePickerClose = useCallback(() => {
    const msg = reactionPickerMsg;
    setReactionPickerMsg(null);
    // If dismissing the picker on own message, offer delete.
    if (msg && msg.senderId === uid) {
      setTimeout(() => {
        Alert.alert('Delete message', 'Remove this message for everyone?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(msg.id) },
        ]);
      }, 100);
    }
  }, [deleteMessage, reactionPickerMsg, uid]);

  // ── List data + renderer ───────────────────────────────────────────────────
  // Inverted list expects newest-first; messages arrive oldest-first.
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const keyExtractor = useCallback((m: Message) => m.id, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Message>) => (
      <ChatBubble
        message={item}
        isOwn={item.senderId === uid}
        index={index}
        myUid={uid}
        roomId={ROOM_ID}
        onLongPress={handleLongPress}
      />
    ),
    [ROOM_ID, handleLongPress, uid]
  );

  const isOwnPickerMsg = !!reactionPickerMsg && reactionPickerMsg.senderId === uid;
  const inputDisabled = !input.trim();

  return (
    <ScreenWrapper edges={['left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>
            {headerTitle}
          </Text>
          <Text style={styles.msgCount}>
            {messages.length} msg{messages.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.participantsBtn}
          onPress={() => setShowParticipants((v) => !v)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Toggle participants list"
          hitSlop={8}
        >
          <Ionicons name="people-outline" size={22} color={Colors.text} />
          {participants.length > 0 && (
            <View style={styles.participantsBadge}>
              <Text style={styles.participantsBadgeText}>{participants.length + 1}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {showParticipants && participants.length > 0 && (
        <View style={styles.participantsList}>
          <Text style={styles.participantsLabel}>Participants</Text>
          {participants.map((p) => (
            <Text key={p.id} style={styles.participantItem}>
              {p.username ? `@${p.username}` : p.displayName}
            </Text>
          ))}
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loadingMessages ? (
          <View style={[styles.messageList, styles.skeletonList]}>
            <SkeletonChatBubble own={false} />
            <SkeletonChatBubble own={true} />
            <SkeletonChatBubble own={false} />
            <SkeletonChatBubble own={true} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={reversedMessages}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            inverted
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={
              reversedMessages.length === 0 ? styles.messageListEmpty : styles.messageList
            }
            initialNumToRender={15}
            maxToRenderPerBatch={12}
            windowSize={11}
            removeClippedSubviews={Platform.OS === 'android'}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <View style={styles.emptyChatIcon}>
                  <Ionicons name="chatbubbles-outline" size={32} color={Colors.textMuted} />
                </View>
                <Text style={styles.emptyChatText}>No messages yet</Text>
                <Text style={styles.emptyChatSub}>Be the first to say something</Text>
              </View>
            }
          />
        )}

        {/* @mention autocomplete popup */}
        {filteredMentions.length > 0 && (
          <View style={styles.mentionList}>
            {filteredMentions.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.mentionItem}
                onPress={() => selectMention(p)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Mention ${p.displayName}`}
              >
                <View style={styles.mentionAvatar}>
                  <Text style={styles.mentionAvatarText}>{initialOf(p.displayName)}</Text>
                </View>
                <View>
                  <Text style={styles.mentionName}>{p.displayName}</Text>
                  {p.username && <Text style={styles.mentionHandle}>@{p.username}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {typingUsers.length > 0 && (
          <View style={styles.typingRow}>
            <TypingDots />
            <Text style={styles.typingText}>
              {typingUsers.length === 1
                ? `${typingNames[typingUsers[0]] || 'Someone'} is typing...`
                : `${typingUsers.length} people are typing...`}
            </Text>
          </View>
        )}

        <View style={styles.inputBar}>
          <TouchableOpacity
            onPress={handleImageSend}
            style={styles.attachBtn}
            disabled={uploading}
            activeOpacity={0.7}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Attach image"
            accessibilityState={{ disabled: uploading }}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={Colors.textMuted} />
            ) : (
              <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
            )}
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={handleInputChange}
            placeholder="Type a message... (@ to mention)"
            placeholderTextColor={Colors.textMuted}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, inputDisabled && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={inputDisabled}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: inputDisabled }}
          >
            <Ionicons
              name="arrow-up"
              size={20}
              color={inputDisabled ? Colors.textDisabled : Colors.background}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Reaction picker modal */}
      <Modal
        visible={!!reactionPickerMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionPickerMsg(null)}
      >
        <TouchableWithoutFeedback onPress={handlePickerClose}>
          <View style={styles.pickerOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerCard}>
                <Text style={styles.pickerHint}>
                  {isOwnPickerMsg ? 'React or dismiss to delete' : 'Add a reaction'}
                </Text>
                <View style={styles.pickerRow}>
                  {REACTION_EMOJIS.map((emoji) => {
                    const active = reactionPickerMsg?.reactions?.[emoji]?.includes(uid);
                    return (
                      <TouchableOpacity
                        key={emoji}
                        style={[styles.pickerEmoji, active && styles.pickerEmojiActive]}
                        onPress={() => handleReactionSelect(emoji)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`React with ${emoji}`}
                      >
                        <Text style={[styles.pickerEmojiText, active && styles.pickerEmojiTextActive]}>
                          {emoji}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {isOwnPickerMsg && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => {
                      const msg = reactionPickerMsg;
                      setReactionPickerMsg(null);
                      if (msg) deleteMessage(msg.id);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Delete message"
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.error} />
                    <Text style={styles.deleteBtnText}>Delete message</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingTop: Platform.OS === 'ios' ? 52 : 44,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs + 2,
    paddingHorizontal: Spacing.xs,
  },
  title: {
    fontFamily: Fonts.headingBold,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    flexShrink: 1,
    letterSpacing: -0.3,
  },
  msgCount: {
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  participantsBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  participantsBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  participantsBadgeText: {
    color: Colors.background,
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    fontVariant: ['tabular-nums'],
  },
  participantsList: {
    backgroundColor: Colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs + 2,
  },
  participantsLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  participantItem: {
    fontFamily: Fonts.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  messageList: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  messageListEmpty: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  skeletonList: { flex: 1, gap: Spacing.gutter, paddingTop: Spacing.md },
  bubbleContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs + 2 },
  ownBubbleContainer: { justifyContent: 'flex-end' },
  otherBubbleContainer: { justifyContent: 'flex-start' },
  bubbleColumn: { maxWidth: '78%' },
  senderAvatar: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderAvatarText: {
    fontFamily: Fonts.bodyBold,
    color: Colors.text,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  bubble: { paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs + 6, borderRadius: Radius.md },
  otherBubble: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 0,
  },
  ownBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 0 },
  senderName: {
    fontFamily: Fonts.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  bubbleText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 23,
  },
  ownBubbleText: { color: Colors.background },
  mentionText: { color: Colors.text, fontFamily: Fonts.bodyBold, fontWeight: FontWeight.bold },
  mentionTextOwn: {
    color: Colors.background,
    fontFamily: Fonts.bodyBold,
    fontWeight: FontWeight.bold,
    textDecorationLine: 'underline',
  },
  timestamp: {
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 5,
    alignSelf: 'flex-end',
    fontVariant: ['tabular-nums'],
  },
  ownTimestamp: { color: 'rgba(255,255,255,0.72)' },
  chatImage: { width: 220, height: 220, borderRadius: Radius.md, marginVertical: 2 },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 5,
    marginHorizontal: Spacing.xs,
  },
  reactionsRowOwn: { justifyContent: 'flex-end' },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.xs + 4,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reactionPillActive: { backgroundColor: Colors.primaryDim, borderColor: Colors.primaryBorder },
  reactionEmoji: { fontFamily: Fonts.bodyMedium, fontSize: FontSize.xs, color: Colors.text },
  reactionCount: {
    fontFamily: Fonts.bodySemibold,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  mentionList: {
    backgroundColor: Colors.surfaceRaised,
    borderTopWidth: 1,
    borderTopColor: Colors.borderStrong,
    maxHeight: 180,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mentionAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionAvatarText: {
    fontFamily: Fonts.bodyBold,
    color: Colors.text,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  mentionName: {
    fontFamily: Fonts.bodySemibold,
    color: Colors.text,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.md,
  },
  mentionHandle: { fontFamily: Fonts.body, color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 1 },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    backgroundColor: Colors.background,
  },
  typingDots: { flexDirection: 'row', gap: 4, marginRight: Spacing.xs + 2, alignItems: 'center' },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.textMuted },
  typingText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 28 : Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  attachBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 44,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm + 2,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    color: Colors.text,
    fontFamily: Fonts.body,
    fontSize: FontSize.md,
    lineHeight: 21,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs + 2 },
  emptyChatIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyChatText: {
    fontFamily: Fonts.headingSemibold,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  emptyChatSub: { fontFamily: Fonts.body, color: Colors.textMuted, fontSize: FontSize.sm },
  // Reaction picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCard: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
    minWidth: 280,
  },
  pickerHint: {
    fontFamily: Fonts.bodyBold,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.heavy,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.xs + 4,
  },
  pickerEmoji: {
    minWidth: 44,
    paddingHorizontal: Spacing.xs + 2,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerEmojiActive: { backgroundColor: Colors.primaryDim, borderColor: Colors.primaryBorder },
  pickerEmojiText: { fontFamily: Fonts.bodyMedium, fontSize: FontSize.sm, color: Colors.text },
  pickerEmojiTextActive: { fontFamily: Fonts.bodyBold, fontWeight: FontWeight.bold },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs + 2,
    minHeight: 44,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.errorDim,
  },
  deleteBtnText: {
    fontFamily: Fonts.bodySemibold,
    color: Colors.error,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
});
