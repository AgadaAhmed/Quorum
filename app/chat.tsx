import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
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
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

type Message = {
  id: string;
  text?: string;
  type?: 'text' | 'image';
  imageUrl?: string;
  senderId: string;
  senderName: string;
  timestamp: any;
  reactions?: { [emoji: string]: string[] };
};

type Participant = { id: string; displayName: string; username?: string };

function renderTextWithMentions(text: string, isOwn: boolean) {
  const parts = text.split(/(@\w+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <Text key={i} style={[styles.mentionText, isOwn && styles.mentionTextOwn]}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </>
  );
}

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
    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 150);
    const a3 = bounce(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 4, marginRight: 6, alignItems: 'center' }}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.textMuted, transform: [{ translateY: dot }] }}
        />
      ))}
    </View>
  );
}

type ChatBubbleProps = {
  message: Message;
  isOwn: boolean;
  index: number;
  roomId: string;
  onLongPress: (msg: Message) => void;
};

function ChatBubble({ message, isOwn, index, roomId, onLongPress }: ChatBubbleProps) {
  const slideX = useRef(new Animated.Value(isOwn ? 40 : -40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const myUid = auth.currentUser?.uid ?? '';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, delay: Math.min(index * 30, 300), useNativeDriver: true }),
      Animated.spring(slideX, { toValue: 0, tension: 80, friction: 10, delay: Math.min(index * 30, 300), useNativeDriver: true }),
    ]).start();
  }, []);

  const toggleReaction = async (emoji: string) => {
    const reactionRef = doc(db, 'chats', roomId, 'messages', message.id);
    const alreadyReacted = message.reactions?.[emoji]?.includes(myUid);
    try {
      await updateDoc(reactionRef, {
        [`reactions.${emoji}`]: alreadyReacted ? arrayRemove(myUid) : arrayUnion(myUid),
      });
    } catch {}
  };

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
          <Text style={styles.senderAvatarText}>{(message.senderName || '?')[0].toUpperCase()}</Text>
        </View>
      )}
      <View style={{ maxWidth: '75%' }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => onLongPress(message)}
          delayLongPress={350}
        >
          <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
            {!isOwn && <Text style={styles.senderName}>{message.senderName}</Text>}
            {message.type === 'image' && message.imageUrl ? (
              <Image source={{ uri: message.imageUrl }} style={styles.chatImage} resizeMode="cover" />
            ) : (
              <Text style={[styles.bubbleText, isOwn && styles.ownBubbleText]}>
                {renderTextWithMentions(message.text ?? '', isOwn)}
              </Text>
            )}
            {message.timestamp && (
              <Text style={[styles.timestamp, isOwn && styles.ownTimestamp]}>
                {new Date(message.timestamp?.toDate?.() || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <View style={[styles.reactionsRow, isOwn && styles.reactionsRowOwn]}>
            {Object.entries(message.reactions)
              .filter(([, uids]) => (uids as string[]).length > 0)
              .map(([emoji, uids]) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => toggleReaction(emoji)}
                  style={[
                    styles.reactionPill,
                    (uids as string[]).includes(myUid) && styles.reactionPillActive,
                  ]}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={styles.reactionCount}>{(uids as string[]).length}</Text>
                </TouchableOpacity>
              ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

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
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();
  const uid = auth.currentUser?.uid || '';
  const { isPro } = useSubscription();

  const ROOM_ID = planId || 'global';
  const headerTitle = planTitle ? `${planTitle}` : 'Global Chat';

  useEffect(() => {
    getDoc(doc(db, 'users', uid)).then((snap) => {
      setSenderName(snap.data()?.displayName || 'Anonymous');
    });

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
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
      setLoadingMessages(false);
    });

    // Listen to typing indicators on the room doc
    const roomRef = doc(db, 'chats', ROOM_ID);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      const typing = snap.data()?.typing as Record<string, number> | undefined;
      if (!typing) { setTypingUsers([]); return; }
      const now = Date.now();
      const activeTypers = Object.entries(typing)
        .filter(([id, ts]) => id !== uid && now - ts < 4000)
        .map(([id]) => id);
      setTypingUsers(activeTypers);
    });

    return () => {
      unsub();
      unsubRoom();
      // Clear own typing on unmount
      updateDoc(doc(db, 'chats', ROOM_ID), { [`typing.${uid}`]: deleteField() }).catch(() => {});
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // Resolve display names for typing users
  useEffect(() => {
    const unknown = typingUsers.filter((id) => !typingNames[id]);
    if (unknown.length === 0) return;
    Promise.all(unknown.map((id) => getDoc(doc(db, 'users', id)))).then((docs) => {
      const newNames: Record<string, string> = {};
      docs.forEach((d) => {
        if (d.exists()) newNames[d.id] = d.data()?.displayName || 'Someone';
      });
      setTypingNames((prev) => ({ ...prev, ...newNames }));
    });
  }, [typingUsers]);

  // Fetch plan participants for @mention
  useEffect(() => {
    if (!planId) return;
    getDoc(doc(db, 'plans', planId)).then(async (snap) => {
      const participantIds: string[] = snap.data()?.participants || [];
      const others = participantIds.filter((id) => id !== uid);
      const docs = await Promise.all(others.map((id) => getDoc(doc(db, 'users', id))));
      setParticipants(docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() } as Participant)));
    });
  }, [planId]);

  const broadcastTyping = () => {
    if (!uid) return;
    setDoc(doc(db, 'chats', ROOM_ID), { typing: { [uid]: Date.now() } }, { merge: true }).catch(() => {});
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      updateDoc(doc(db, 'chats', ROOM_ID), { [`typing.${uid}`]: deleteField() }).catch(() => {});
    }, 3500);
  };

  const clearTyping = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    updateDoc(doc(db, 'chats', ROOM_ID), { [`typing.${uid}`]: deleteField() }).catch(() => {});
  };

  const handleInputChange = (text: string) => {
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
  };

  const selectMention = (p: Participant) => {
    const name = p.username || p.displayName.replace(/\s+/g, '');
    const lastAt = input.lastIndexOf('@');
    setInput(input.slice(0, lastAt) + '@' + name + ' ');
    setMentionQuery(null);
    Haptics.selectionAsync();
  };

  const filteredMentions = mentionQuery !== null
    ? participants.filter((p) =>
        (p.displayName || '').toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
        (p.username || '').toLowerCase().startsWith(mentionQuery.toLowerCase())
      )
    : [];

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

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
  };

  const handleImageSend = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    if (!uid) return;
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
        senderName: senderName || (auth.currentUser?.displayName ?? 'User'),
        timestamp: serverTimestamp(),
      });
    } catch {
      showToast('Failed to send image', 'error');
    }
    setUploading(false);
  };

  const handleLongPress = (msg: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReactionPickerMsg(msg);
  };

  const handleReactionSelect = async (emoji: string) => {
    if (!reactionPickerMsg) return;
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    const alreadyReacted = reactionPickerMsg.reactions?.[emoji]?.includes(myUid);
    const reactionRef = doc(db, 'chats', ROOM_ID, 'messages', reactionPickerMsg.id);
    try {
      await updateDoc(reactionRef, {
        [`reactions.${emoji}`]: alreadyReacted ? arrayRemove(myUid) : arrayUnion(myUid),
      });
    } catch {}

    // If own message, also offer delete after closing picker
    if (reactionPickerMsg.senderId === myUid) {
      setReactionPickerMsg(null);
    } else {
      setReactionPickerMsg(null);
    }
  };

  const handlePickerClose = () => {
    // If long-pressing own message, show delete option too
    if (reactionPickerMsg && reactionPickerMsg.senderId === auth.currentUser?.uid) {
      const msg = reactionPickerMsg;
      setReactionPickerMsg(null);
      setTimeout(() => {
        Alert.alert('Delete message', 'Remove this message for everyone?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteDoc(doc(db, 'chats', ROOM_ID, 'messages', msg.id));
              } catch {}
            },
          },
        ]);
      }, 100);
    } else {
      setReactionPickerMsg(null);
    }
  };

  return (
    <ScreenWrapper noSafeArea>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>{headerTitle}</Text>
          <Text style={styles.msgCount}>{messages.length} msg{messages.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={styles.participantsBtn}
          onPress={() => setShowParticipants(!showParticipants)}
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
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loadingMessages ? (
          <View style={[styles.messageList, { gap: 16 }]}>
            <SkeletonChatBubble own={false} />
            <SkeletonChatBubble own={true} />
            <SkeletonChatBubble own={false} />
            <SkeletonChatBubble own={true} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={[...messages].reverse()}
            keyExtractor={(m) => m.id}
            inverted
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.messageList}
            renderItem={({ item, index }) => (
              <ChatBubble
                message={item}
                isOwn={item.senderId === uid}
                index={index}
                roomId={ROOM_ID}
                onLongPress={handleLongPress}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubbles-outline" size={56} color={Colors.textMuted} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyChatText}>No messages yet. Say hello!</Text>
              </View>
            }
          />
        )}

        {/* @mention autocomplete popup */}
        {filteredMentions.length > 0 && (
          <View style={styles.mentionList}>
            {filteredMentions.map((p) => (
              <TouchableOpacity key={p.id} style={styles.mentionItem} onPress={() => selectMention(p)}>
                <View style={styles.mentionAvatar}>
                  <Text style={styles.mentionAvatarText}>{p.displayName[0]?.toUpperCase()}</Text>
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
          >
            <Ionicons
              name="image-outline"
              size={22}
              color={uploading ? Colors.textDisabled : Colors.textMuted}
            />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={handleInputChange}
            placeholder="Type a message... (@ to mention)"
            placeholderTextColor={Colors.textMuted}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim()}
          >
            <Ionicons name="send" size={18} color={Colors.text} />
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
                  {reactionPickerMsg?.senderId === auth.currentUser?.uid
                    ? 'React or dismiss to delete'
                    : 'Add a reaction'}
                </Text>
                <View style={styles.pickerRow}>
                  {REACTION_EMOJIS.map((emoji) => {
                    const active = reactionPickerMsg?.reactions?.[emoji]?.includes(auth.currentUser?.uid ?? '');
                    return (
                      <TouchableOpacity
                        key={emoji}
                        style={[styles.pickerEmoji, active && styles.pickerEmojiActive]}
                        onPress={() => handleReactionSelect(emoji)}
                      >
                        <Text style={styles.pickerEmojiText}>{emoji}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {reactionPickerMsg?.senderId === auth.currentUser?.uid && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={async () => {
                      const msg = reactionPickerMsg;
                      setReactionPickerMsg(null);
                      try {
                        await deleteDoc(doc(db, 'chats', ROOM_ID, 'messages', msg!.id));
                      } catch {}
                    }}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 52,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.sm },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, flex: 1 },
  msgCount: { fontSize: FontSize.xs, color: Colors.textMuted },
  participantsBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  participantsBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: Colors.primary, borderRadius: 99,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  participantsBadgeText: { color: Colors.text, fontSize: 9, fontWeight: '800' },
  participantsList: {
    backgroundColor: Colors.surfaceRaised, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 4,
  },
  participantsLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  participantItem: { fontSize: FontSize.sm, color: Colors.text },
  messageList: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: 8, flexGrow: 1 },
  bubbleContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  ownBubbleContainer: { justifyContent: 'flex-end' },
  otherBubbleContainer: { justifyContent: 'flex-start' },
  senderAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center',
  },
  senderAvatarText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.lg },
  otherBubble: {
    backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4,
  },
  ownBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  senderName: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700', marginBottom: 2 },
  bubbleText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },
  ownBubbleText: { color: '#ffffff' },
  mentionText: { color: Colors.primary, fontWeight: '700' },
  mentionTextOwn: { color: Colors.text, fontWeight: '700', textDecorationLine: 'underline' },
  timestamp: { fontSize: 10, color: Colors.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  ownTimestamp: { color: Colors.text + '88' },
  chatImage: { width: 200, height: 200, borderRadius: 12, marginVertical: 2 },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginHorizontal: 8 },
  reactionsRowOwn: { justifyContent: 'flex-end' },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99,
    backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border,
  },
  reactionPillActive: { backgroundColor: Colors.primaryDim, borderColor: Colors.primaryBorder },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  mentionList: {
    backgroundColor: Colors.surfaceRaised, borderTopWidth: 1, borderTopColor: Colors.border,
    maxHeight: 160,
  },
  mentionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  mentionAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center',
  },
  mentionAvatarText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  mentionName: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  mentionHandle: { color: Colors.primary, fontSize: FontSize.xs },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    backgroundColor: Colors.background,
  },
  typingText: { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 28 : Spacing.md,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  attachBtn: { padding: 6 },
  input: {
    flex: 1, backgroundColor: Colors.surfaceRaised, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 10,
    color: Colors.text, fontSize: FontSize.md, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.border },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 4 },
  emptyChatText: { color: Colors.textMuted, fontSize: FontSize.md },
  // Reaction picker modal
  pickerOverlay: {
    flex: 1, backgroundColor: Colors.overlay,
    alignItems: 'center', justifyContent: 'center',
  },
  pickerCard: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1, borderColor: Colors.borderStrong,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 12,
    minWidth: 280,
  },
  pickerHint: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  pickerRow: { flexDirection: 'row', gap: 8 },
  pickerEmoji: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pickerEmojiActive: { backgroundColor: Colors.primaryDim, borderColor: Colors.primaryBorder },
  pickerEmojiText: { fontSize: 22 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.errorDim,
    backgroundColor: Colors.errorDim,
  },
  deleteBtnText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: '600' },
});
