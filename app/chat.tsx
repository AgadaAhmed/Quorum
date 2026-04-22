import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { hasScamKeywords } from '../lib/scamDetection';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  doc,
  getDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useToast } from '../components/Toast';
import ScreenWrapper from '../components/ScreenWrapper';
import { SkeletonChatBubble } from '../components/SkeletonLoader';
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

type Message = {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: any;
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

function ChatBubble({ message, isOwn, index }: { message: Message; isOwn: boolean; index: number }) {
  const slideX = useRef(new Animated.Value(isOwn ? 40 : -40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, delay: Math.min(index * 30, 300), useNativeDriver: true }),
      Animated.spring(slideX, { toValue: 0, tension: 80, friction: 10, delay: Math.min(index * 30, 300), useNativeDriver: true }),
    ]).start();
  }, []);

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
      <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
        {!isOwn && <Text style={styles.senderName}>{message.senderName}</Text>}
        <Text style={[styles.bubbleText, isOwn && styles.ownBubbleText]}>
          {renderTextWithMentions(message.text, isOwn)}
        </Text>
        {message.timestamp && (
          <Text style={[styles.timestamp, isOwn && styles.ownTimestamp]}>
            {new Date(message.timestamp?.toDate?.() || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
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
  const flatListRef = useRef<FlatList>(null);
  const { showToast } = useToast();
  const uid = auth.currentUser?.uid || '';

  const ROOM_ID = planId || 'global';
  const headerTitle = planTitle ? `${planTitle}` : 'Global Chat';

  useEffect(() => {
    getDoc(doc(db, 'users', uid)).then((snap) => {
      setSenderName(snap.data()?.displayName || 'Anonymous');
    });

    const q = query(
      collection(db, 'chats', ROOM_ID, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
      setLoadingMessages(false);
    });
    return unsub;
  }, []);

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

  const handleInputChange = (text: string) => {
    setInput(text);
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        await addDoc(collection(db, 'chats', ROOM_ID, 'messages'), {
          text,
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
              <ChatBubble message={item} isOwn={item.senderId === uid} index={index} />
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

        <View style={styles.inputBar}>
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
    borderBottomColor: Colors.glassBorder,
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
    backgroundColor: Colors.surfaceRaised, borderBottomWidth: 1, borderBottomColor: Colors.glassBorder,
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
  bubble: { maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.lg },
  otherBubble: {
    backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.glassBorder, borderBottomLeftRadius: 4,
  },
  ownBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  senderName: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700', marginBottom: 2 },
  bubbleText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 20 },
  ownBubbleText: { color: Colors.text },
  mentionText: { color: Colors.primary, fontWeight: '700' },
  mentionTextOwn: { color: Colors.text, fontWeight: '700', textDecorationLine: 'underline' },
  timestamp: { fontSize: 10, color: Colors.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  ownTimestamp: { color: Colors.text + '88' },
  mentionList: {
    backgroundColor: Colors.surfaceRaised, borderTopWidth: 1, borderTopColor: Colors.glassBorder,
    maxHeight: 160,
  },
  mentionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.glassBorder },
  mentionAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center',
  },
  mentionAvatarText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  mentionName: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  mentionHandle: { color: Colors.primary, fontSize: FontSize.xs },
  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 28 : Spacing.md,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1, backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.glassBorder,
    borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 10,
    color: Colors.text, fontSize: FontSize.md, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.glassBorder },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 4 },
  emptyChatText: { color: Colors.textMuted, fontSize: FontSize.md },
});
