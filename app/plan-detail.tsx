import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import * as Calendar from 'expo-calendar';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  doc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  deleteField,
  getDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import ConfettiParticles, { ConfettiRef } from '../components/ConfettiParticles';
import SkeletonCard from '../components/SkeletonLoader';
import QuorumProgressBar from '../components/QuorumProgressBar';
import AnimatedButton from '../components/AnimatedButton';
import AnimatedCard from '../components/AnimatedCard';
import { useToast } from '../components/Toast';
import ReportModal from '../components/ReportModal';
import StarRating from '../components/StarRating';
import SafetyTimerModal from '../components/SafetyTimerModal';
import MomentsGallery from '../components/MomentsGallery';
import { hasScamKeywords } from '../lib/scamDetection';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

const REACTIONS = ['❤️', '🔥', '😂', '😮', '👎'];
const CATEGORIES = ['Music', 'Food', 'Sports', 'Art', 'Gaming', 'Travel', 'Party', 'Study'];
const CATEGORY_EMOJI: Record<string, string> = {
  Music: '🎵', Food: '🍔', Sports: '⚽', Art: '🎨',
  Gaming: '🎮', Travel: '✈️', Party: '🎉', Study: '📚',
};

const DETAIL_TABS = ['Overview', 'Poll', 'Chat', 'Moments'] as const;
type DetailTab = typeof DETAIL_TABS[number];

type Friend = { id: string; displayName: string; username?: string };

export default function PlanDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showToast } = useToast();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [friends, setFriends] = useState<Friend[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editUsingCustomCategory, setEditUsingCustomCategory] = useState(false);
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voting, setVoting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [newComment, setNewComment] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [hostRating, setHostRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('Overview');
  // Safety features
  const [timerActive, setTimerActive] = useState(false);
  const [timerEndsAt, setTimerEndsAt] = useState<number>(0);
  const [timerNotifId, setTimerNotifId] = useState<string>('');
  const [timerCountdown, setTimerCountdown] = useState('');
  const [showSafetyTimer, setShowSafetyTimer] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState<{ name: string; phone: string } | null>(null);

  const celebrationScale = useRef(new Animated.Value(0)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<ConfettiRef>(null);

  const uid = auth.currentUser?.uid || '';

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'plans', id), (snap) => {
      const data = { id: snap.id, ...snap.data() };
      setPlan(data);
      setLoading(false);
      fetchParticipantNames((data as any).participants || []);
    });
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then(async (snap) => {
      const friendIds: string[] = snap.data()?.friends || [];
      if (friendIds.length === 0) return;
      const friendDocs = await Promise.all(friendIds.map((fid) => getDoc(doc(db, 'users', fid))));
      setFriends(friendDocs.map((d) => ({ id: d.id, ...d.data() } as Friend)));
    });
  }, [uid]);

  useEffect(() => {
    if (!plan?.createdBy) return;
    getDoc(doc(db, 'users', plan.createdBy)).then((snap) => {
      setCreatorName(snap.data()?.displayName || 'the host');
    });
  }, [plan?.createdBy]);

  // Load safety timer + emergency contact on mount
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      const data = snap.data();
      const timer = data?.safetyTimer;
      if (timer && timer.endsAt > Date.now()) {
        setTimerActive(true);
        setTimerEndsAt(timer.endsAt);
        setTimerNotifId(timer.notificationId || '');
      }
      setEmergencyContact(data?.emergencyContact || null);
    });
  }, [uid]);

  // Countdown interval for safety timer
  useEffect(() => {
    if (!timerActive || !timerEndsAt) return;
    const tick = () => {
      const remaining = timerEndsAt - Date.now();
      if (remaining <= 0) {
        setTimerCountdown('00:00');
        return;
      }
      const totalSecs = Math.floor(remaining / 1000);
      const hrs = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;
      if (hrs > 0) {
        setTimerCountdown(`${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`);
      } else {
        setTimerCountdown(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timerEndsAt]);

  // Pre-event safety notification: schedule 24h-before notification for confirmed public plans
  useEffect(() => {
    if (!plan || !uid || !id) return;
    if (plan.status !== 'confirmed') return;
    if (!plan.isPublic) return;
    if (!plan.participants?.includes(uid)) return;
    if (!plan.date) return;

    const schedulePreEventNotif = async () => {
      const eventDate = new Date(plan.date);
      if (isNaN(eventDate.getTime())) return;
      const notifAt = eventDate.getTime() - 24 * 60 * 60 * 1000;
      if (notifAt <= Date.now()) return;

      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      const safetyNotifs: Record<string, boolean> = snap.data()?.safetyNotifs || {};
      if (safetyNotifs[id]) return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Plan tomorrow: ${plan.title}`,
          body: 'Meet in a public place, tell someone where you\'re going, keep your phone charged. Stay safe!',
          data: { planId: id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(notifAt),
        },
      });
      await updateDoc(userRef, { [`safetyNotifs.${id}`]: true });
    };

    schedulePreEventNotif().catch(() => {});
  }, [plan?.status, plan?.isPublic, plan?.participants, id, uid]);

  const fetchParticipantNames = async (participantIds: string[]) => {
    if (!participantIds.length) return;
    const names: Record<string, string> = {};
    await Promise.all(
      participantIds.map(async (pid) => {
        const snap = await getDoc(doc(db, 'users', pid));
        const data = snap.data();
        names[pid] = data?.displayName || data?.username || 'Unknown';
      })
    );
    setParticipantNames(names);
  };

  const handleVote = async () => {
    if (!plan || voting) return;
    setVoting(true);
    const planRef = doc(db, 'plans', plan.id);
    const hasVoted = plan.votes?.includes(uid);
    Haptics.impactAsync(hasVoted ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await updateDoc(planRef, { votes: hasVoted ? arrayRemove(uid) : arrayUnion(uid) });
      const newCount = (plan.votes?.length || 0) + (hasVoted ? -1 : 1);
      if (!hasVoted && newCount >= plan.requiredVotes) {
        await updateDoc(planRef, { status: 'confirmed' });
        triggerCelebration();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🎉 Quorum Reached!',
            body: `"${plan.title}" has enough votes — it's confirmed!`,
            data: { planId: plan.id },
          },
          trigger: null,
        });
        if (plan.dateTimestamp) {
          const planDate = new Date(plan.dateTimestamp);
          const now = Date.now();
          const oneDayBefore = planDate.getTime() - 24 * 60 * 60 * 1000;
          const oneHourBefore = planDate.getTime() - 60 * 60 * 1000;
          if (oneDayBefore > now) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: '📅 Plan Tomorrow!',
                body: `"${plan.title}" is happening tomorrow. Get ready!`,
                data: { planId: plan.id },
              },
              trigger: { seconds: Math.floor((oneDayBefore - now) / 1000) } as any,
            });
          }
          if (oneHourBefore > now) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: '⏰ Plan in 1 hour!',
                body: `"${plan.title}" starts in 1 hour!`,
                data: { planId: plan.id },
              },
              trigger: { seconds: Math.floor((oneHourBefore - now) / 1000) } as any,
            });
          }
        }
      }
    } catch {
      showToast('Failed to register vote', 'error');
    } finally {
      setVoting(false);
    }
  };

  const handleReact = async (emoji: string) => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const reactionKey = `reactions.${emoji}`;
    const currentReactions: string[] = plan.reactions?.[emoji] || [];
    const hasReacted = currentReactions.includes(uid);
    await updateDoc(doc(db, 'plans', plan.id), {
      [reactionKey]: hasReacted ? arrayRemove(uid) : arrayUnion(uid),
    });
  };

  const handlePollVote = async (option: string) => {
    if (!plan?.poll) return;
    Haptics.selectionAsync();
    const updates: any = {};
    plan.poll.options.forEach((opt: string) => {
      const currentVotes: string[] = plan.poll.votes?.[opt] || [];
      if (opt === option) {
        updates[`poll.votes.${opt}`] = currentVotes.includes(uid) ? arrayRemove(uid) : arrayUnion(uid);
      } else if (currentVotes.includes(uid)) {
        updates[`poll.votes.${opt}`] = arrayRemove(uid);
      }
    });
    if (Object.keys(updates).length > 0) {
      await updateDoc(doc(db, 'plans', plan.id), updates);
    }
  };

  const handleInvite = async (friendId: string) => {
    if (!plan) return;
    Haptics.selectionAsync();
    await updateDoc(doc(db, 'plans', plan.id), { participants: arrayUnion(friendId) });
    showToast('Friend invited!');
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    const dateStr = editDate
      ? editDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : plan.date || '';
    await updateDoc(doc(db, 'plans', plan.id), {
      title: editTitle.trim(),
      description: editDesc.trim(),
      location: editLocation.trim(),
      date: dateStr,
      category: editCategory || null,
      isPublic: editIsPublic,
    });
    setSaving(false);
    setShowEdit(false);
    showToast('Plan updated!');
  };

  const handleDelete = () => {
    Alert.alert('Delete Plan', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          try {
            await deleteDoc(doc(db, 'plans', plan.id));
            router.replace('/(tabs)');
          } catch {
            showToast('Failed to delete plan', 'error');
          }
        },
      },
    ]);
  };

  const handleLeave = () => {
    Alert.alert('Leave Plan', 'You will be removed from this plan.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          try {
            await updateDoc(doc(db, 'plans', plan.id), {
              participants: arrayRemove(uid),
              votes: arrayRemove(uid),
            });
            router.replace('/(tabs)');
          } catch {
            showToast('Failed to leave plan', 'error');
          }
        },
      },
    ]);
  };

  const handleArchive = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await updateDoc(doc(db, 'plans', plan.id), { archivedBy: arrayUnion(uid) });
      showToast('Plan archived');
      router.replace('/(tabs)');
    } catch {
      showToast('Failed to archive plan', 'error');
    }
  };

  const handleAddToCalendar = async () => {
    if (!plan?.dateTimestamp) { showToast('No date set for this plan', 'error'); return; }
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') { showToast('Calendar access denied', 'error'); return; }
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writeable = calendars.find((c) => c.allowsModifications);
      if (!writeable) { showToast('No writable calendar found', 'error'); return; }
      const startDate = new Date(plan.dateTimestamp);
      const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
      await Calendar.createEventAsync(writeable.id, {
        title: plan.title,
        notes: plan.description || '',
        location: plan.location || '',
        startDate,
        endDate,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Added to your calendar!');
    } catch {
      showToast('Failed to add to calendar', 'error');
    }
  };

  const handleShare = async () => {
    if (!plan) return;
    const text = `Check out this plan on Quorum!\n\n📌 ${plan.title}${plan.description ? `\n${plan.description}` : ''}${plan.date ? `\n📅 ${plan.date}` : ''}${plan.location ? `\n📍 ${plan.location}` : ''}\n\nVotes: ${plan.votes?.length || 0}/${plan.requiredVotes}`;
    try {
      await Sharing.shareAsync('data:text/plain;base64,' + btoa(text), { mimeType: 'text/plain', dialogTitle: 'Share Plan' });
    } catch {
      Alert.alert('Share', text);
    }
  };

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingPhoto(true);
    try {
      const uri = result.assets[0].uri;
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = () => reject(new Error('Network request failed'));
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
      });
      const photoId = `${uid}_${Date.now()}`;
      const storageRef = ref(storage, `plan-photos/${plan.id}/${photoId}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'plans', plan.id), { photos: arrayUnion(url) });
      showToast('Photo added!');
    } catch {
      showToast('Failed to upload photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!plan || !isCreator) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const template = {
      id: `${plan.id}_${Date.now()}`,
      name: plan.title,
      description: plan.description || '',
      location: plan.location || '',
      category: plan.category || '',
      requiredVotes: plan.requiredVotes || 3,
      isPublic: plan.isPublic ?? false,
      maxParticipants: plan.maxParticipants || null,
    };
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const existing: any[] = snap.data()?.templates || [];
    if (existing.length >= 10) { showToast('Max 10 templates', 'error'); return; }
    await updateDoc(userRef, { templates: [...existing, template] });
    showToast('Saved as template!');
  };

  const handleShareCode = () => {
    if (!plan?.inviteCode) return;
    Share.share({
      message: `Join "${plan.title}" on Quorum! Use invite code: ${plan.inviteCode}`,
    });
  };

  const handleRateHost = async () => {
    if (!plan || !hostRating || submittingRating) return;
    setSubmittingRating(true);
    try {
      await updateDoc(doc(db, 'plans', plan.id), {
        [`hostRatings.${uid}`]: hostRating,
      });
      const hostSnap = await getDoc(doc(db, 'users', plan.createdBy));
      const hostData = hostSnap.data();
      const currentAvg = hostData?.averageRating || 0;
      const currentCount = hostData?.totalRatings || 0;
      const newCount = currentCount + 1;
      const newAvg = (currentAvg * currentCount + hostRating) / newCount;
      await updateDoc(doc(db, 'users', plan.createdBy), {
        averageRating: Math.round(newAvg * 10) / 10,
        totalRatings: newCount,
      });
      showToast('Thanks for rating!');
    } catch {
      showToast('Failed to submit rating', 'error');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleAddChecklistItem = async () => {
    if (!newChecklistItem.trim() || !plan) return;
    Haptics.selectionAsync();
    const itemId = `${uid}_${Date.now()}`;
    await updateDoc(doc(db, 'plans', plan.id), {
      [`checklist.${itemId}`]: { text: newChecklistItem.trim(), completedBy: null, addedBy: uid },
    });
    setNewChecklistItem('');
  };

  const handleToggleChecklistItem = async (itemId: string, completedBy: string | null) => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateDoc(doc(db, 'plans', plan.id), {
      [`checklist.${itemId}.completedBy`]: completedBy ? null : uid,
    });
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateDoc(doc(db, 'plans', plan.id), {
      [`checklist.${itemId}`]: deleteField(),
    });
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !plan) return;
    Haptics.selectionAsync();
    const commentId = `${uid}_${Date.now()}`;
    const myName = participantNames[uid] || auth.currentUser?.email?.split('@')[0] || 'You';
    await updateDoc(doc(db, 'plans', plan.id), {
      [`comments.${commentId}`]: {
        text: newComment.trim(),
        authorId: uid,
        authorName: myName,
        timestamp: Date.now(),
      },
    });
    setNewComment('');
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateDoc(doc(db, 'plans', plan.id), {
      [`comments.${commentId}`]: deleteField(),
    });
  };

  const triggerCelebration = () => {
    confettiRef.current?.fire();
    Animated.sequence([
      Animated.parallel([
        Animated.spring(celebrationScale, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true }),
        Animated.timing(celebrationOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      Animated.delay(2200),
      Animated.parallel([
        Animated.spring(celebrationScale, { toValue: 0, tension: 50, friction: 5, useNativeDriver: true }),
        Animated.timing(celebrationOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  };

  const handleImSafe = async () => {
    if (timerNotifId) {
      await Notifications.cancelScheduledNotificationAsync(timerNotifId).catch(() => {});
    }
    await updateDoc(doc(db, 'users', uid), { safetyTimer: null }).catch(() => {});
    setTimerActive(false);
    setTimerEndsAt(0);
    setTimerNotifId('');
    setTimerCountdown('');
    showToast('Stay safe!');
  };

  const hasVoted = plan?.votes?.includes(uid);
  const voteCount = plan?.votes?.length || 0;
  const required = plan?.requiredVotes || 3;
  const isCreator = plan?.createdBy === uid;
  const isArchived = plan?.archivedBy?.includes(uid) === true;
  const nonParticipantFriends = friends.filter((f) => !plan?.participants?.includes(f.id));
  const isParticipant = plan?.participants?.includes(uid) === true;
  const scamFlagged = plan ? hasScamKeywords((plan.title || '') + ' ' + (plan.description || '')) : false;
  const planDateMs = plan?.date ? new Date(plan.date).getTime() : NaN;
  const planDateNotPassed = !isNaN(planDateMs) && planDateMs > Date.now();

  if (loading || !plan) {
    return (
      <ScreenWrapper>
        <View style={styles.loadingHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.menuBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Plan Detail</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </ScreenWrapper>
    );
  }

  // ─── Overview tab content ───────────────────────────────────────────────────
  const renderOverview = () => (
    <>
      {/* Plan Info */}
      <AnimatedCard index={0} style={{ marginBottom: Spacing.md }}>
        {plan.coverUrl ? (
          <Image source={{ uri: plan.coverUrl }} style={styles.coverImage} resizeMode="cover" />
        ) : null}
        <View style={styles.planTitleRow}>
          <Text style={styles.planTitle}>{plan.title}</Text>
          {plan.category && (
            <Text style={styles.categoryTag}>
              {CATEGORY_EMOJI[plan.category] || '📌'} {plan.category}
            </Text>
          )}
        </View>
        {scamFlagged && (
          <View style={styles.scamBanner}>
            <Ionicons name="warning-outline" size={16} color={Colors.error} style={{ marginRight: 8 }} />
            <Text style={styles.scamBannerText}>
              This event mentions payment or transfers. Quorum never facilitates money. Exercise caution.
            </Text>
          </View>
        )}
        {plan.description ? <Text style={styles.planDesc}>{plan.description}</Text> : null}
        <View style={styles.metaGrid}>
          {plan.date && (
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>{plan.date}</Text>
            </View>
          )}
          {plan.location && (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>{plan.location}</Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Ionicons name={plan.isPublic ? 'globe-outline' : 'lock-closed-outline'} size={14} color={Colors.textMuted} />
            <Text style={styles.metaText}>{plan.isPublic ? 'Public' : 'Private'}</Text>
          </View>
          {plan.voteDeadline && (
            <View style={styles.metaItem}>
              <Ionicons name="timer-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>
                Vote by {new Date(plan.voteDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          )}
        </View>

        {/* Tell a Friend */}
        <TouchableOpacity
          style={styles.tellFriendBtn}
          onPress={() =>
            Share.share({
              message: `I'm going to "${plan.title}" on ${plan.date} at ${plan.location}. If you don't hear from me after, check on me! (Sent from Quorum)`,
            })
          }
        >
          <Ionicons name="people-outline" size={15} color={Colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={styles.tellFriendText}>Tell a Friend</Text>
        </TouchableOpacity>

        {/* Reactions */}
        <View style={styles.reactionsRow}>
          {REACTIONS.map((emoji) => {
            const count = plan.reactions?.[emoji]?.length || 0;
            const reacted = plan.reactions?.[emoji]?.includes(uid);
            return (
              <TouchableOpacity
                key={emoji}
                style={[styles.reactionBtn, reacted && styles.reactionBtnActive]}
                onPress={() => handleReact(emoji)}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 0 && <Text style={[styles.reactionCount, reacted && styles.reactionCountActive]}>{count}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Creator actions */}
        {isCreator && (
          <View style={styles.creatorActions}>
            <TouchableOpacity
              style={[styles.editBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
              onPress={() => {
                setEditTitle(plan.title);
                setEditDesc(plan.description || '');
                setEditLocation(plan.location || '');
                setEditDate(plan.dateTimestamp ? new Date(plan.dateTimestamp) : null);
                setEditCategory(plan.category || '');
                setEditUsingCustomCategory(!!plan.category && !CATEGORIES.includes(plan.category));
                setEditIsPublic(plan.isPublic ?? true);
                setShowEdit(true);
              }}
            >
              <Ionicons name="create-outline" size={14} color={Colors.text} style={{ marginRight: 4 }} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.archiveBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} onPress={handleArchive}>
              <Ionicons name="archive-outline" size={14} color={Colors.gold} style={{ marginRight: 4 }} />
              <Text style={styles.archiveBtnText}>{isArchived ? 'Restore' : 'Archive'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.deleteBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={14} color={Colors.error} style={{ marginRight: 4 }} />
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        {!isCreator && (
          <View style={styles.creatorActions}>
            <TouchableOpacity style={[styles.archiveBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} onPress={handleArchive}>
              <Ionicons name="archive-outline" size={14} color={Colors.gold} style={{ marginRight: 4 }} />
              <Text style={styles.archiveBtnText}>{isArchived ? 'Restore' : 'Archive'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.leaveBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} onPress={handleLeave}>
              <Ionicons name="exit-outline" size={14} color={Colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={styles.leaveBtnText}>Leave Plan</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Save as Template */}
        {isCreator && (
          <TouchableOpacity
            style={[styles.calendarBtn, { marginTop: 4, borderColor: Colors.primary + '44', backgroundColor: Colors.primary + '11' }]}
            onPress={handleSaveAsTemplate}
          >
            <Ionicons name="bookmark-outline" size={14} color={Colors.primary} style={{ marginRight: 4 }} />
            <Text style={[styles.calendarBtnText, { color: Colors.primary }]}>Save as Template</Text>
          </TouchableOpacity>
        )}

        {/* Invite Code */}
        {plan.inviteCode && (
          <View style={styles.inviteCodeSection}>
            <View style={styles.inviteCodeRow}>
              <Ionicons name="key-outline" size={14} color={Colors.primary} />
              <Text style={styles.inviteCodeLabel}>Invite Code</Text>
              <TouchableOpacity onPress={handleShareCode} style={styles.inviteCodeBadge}>
                <Text style={styles.inviteCodeText}>{plan.inviteCode}</Text>
                <Ionicons name="share-outline" size={12} color={Colors.primary} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Calendar export (confirmed plans only) */}
        {plan.status === 'confirmed' && plan.dateTimestamp && (
          <TouchableOpacity style={[styles.calendarBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} onPress={handleAddToCalendar}>
            <Ionicons name="calendar-outline" size={14} color={Colors.success} style={{ marginRight: 4 }} />
            <Text style={styles.calendarBtnText}>Add to Calendar</Text>
          </TouchableOpacity>
        )}

        {/* Safety Timer (confirmed plans only) */}
        {plan.status === 'confirmed' && (
          timerActive ? (
            <View style={styles.timerActiveBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.timerActiveTitle}>Timer active — tap when safe</Text>
                <Text style={styles.timerCountdown}>{timerCountdown} remaining</Text>
              </View>
              <TouchableOpacity style={styles.imSafeBtn} onPress={handleImSafe}>
                <Text style={styles.imSafeBtnText}>I'm Safe</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.safetyTimerBtn}
              onPress={() => setShowSafetyTimer(true)}
            >
              <Ionicons name="shield-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={styles.safetyTimerBtnText}>Start Check-In Timer</Text>
            </TouchableOpacity>
          )
        )}
      </AnimatedCard>

      {/* Quorum & Vote */}
      <AnimatedCard index={1} style={{ marginBottom: Spacing.md }}>
        <Text style={styles.sectionTitle}>Quorum Progress</Text>
        <QuorumProgressBar votes={voteCount} required={required} />
        <View style={{ height: 12 }} />
        <AnimatedButton
          label={hasVoted ? "You're In — Withdraw" : 'Vote to Confirm'}
          onPress={handleVote}
          variant={hasVoted ? 'secondary' : 'primary'}
          loading={voting}
          disabled={voting}
        />
        {/* Host rating prompt */}
        {plan.status === 'confirmed' &&
          plan.dateTimestamp &&
          new Date(plan.dateTimestamp) < new Date() &&
          uid !== plan.createdBy &&
          plan.participants?.includes(uid) &&
          !plan.hostRatings?.[uid] && (
            <View style={styles.ratingCard}>
              <View style={styles.ratingCardHeader}>
                <Ionicons name="star-half-outline" size={18} color={Colors.gold} style={{ marginRight: 6 }} />
                <Text style={styles.ratingCardTitle}>Rate your experience</Text>
              </View>
              <Text style={styles.ratingCardSub}>How was {creatorName} as a host?</Text>
              <StarRating value={hostRating} onChange={setHostRating} size={32} />
              {hostRating > 0 && (
                <TouchableOpacity
                  style={[styles.ratingSubmitBtn, submittingRating && { opacity: 0.5 }]}
                  onPress={handleRateHost}
                  disabled={submittingRating}
                >
                  <Text style={styles.ratingSubmitText}>
                    {submittingRating ? 'Submitting...' : 'Submit Rating'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
      </AnimatedCard>

      {/* Participants */}
      <AnimatedCard index={2} style={{ marginBottom: Spacing.md }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Participants ({plan.participants?.length || 0}{plan.maxParticipants ? `/${plan.maxParticipants}` : ''})
            {plan.maxParticipants && plan.participants?.length >= plan.maxParticipants ? ' · Full' : ''}
          </Text>
          {isCreator && (!plan.maxParticipants || plan.participants?.length < plan.maxParticipants) && (
            <TouchableOpacity onPress={() => setShowInvite(!showInvite)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={showInvite ? 'checkmark' : 'person-add-outline'} size={16} color={Colors.primary} />
              <Text style={styles.inviteToggle}>{showInvite ? 'Done' : 'Invite'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {plan.participants?.map((pid: string) => {
          const name = participantNames[pid] || 'Loading...';
          const hasVotedP = plan.votes?.includes(pid);
          return (
            <View key={pid} style={styles.participantRow}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
                onPress={() => pid !== uid && router.push({ pathname: '/user-profile', params: { userId: pid } } as any)}
              >
                <View style={styles.participantAvatar}>
                  <Text style={{ color: Colors.text, fontWeight: '700' }}>{name[0]?.toUpperCase() || '?'}</Text>
                </View>
                <Text style={styles.participantName}>{name}{pid === uid ? ' (You)' : ''}</Text>
              </TouchableOpacity>
              {hasVotedP && (
                <View style={styles.votedBadge}><Text style={styles.votedText}>Voted</Text></View>
              )}
            </View>
          );
        })}

        {showInvite && nonParticipantFriends.length > 0 && (
          <View style={styles.inviteSection}>
            <Text style={styles.inviteSectionTitle}>Invite Friends</Text>
            {nonParticipantFriends.map((f) => (
              <View key={f.id} style={styles.inviteRow}>
                <View style={styles.participantAvatar}>
                  <Text style={{ color: Colors.text, fontWeight: '700' }}>{f.displayName?.[0]?.toUpperCase() || '?'}</Text>
                </View>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/user-profile', params: { userId: f.id } } as any)}
                >
                  <Text style={styles.participantName}>{f.displayName}</Text>
                  {f.username && <Text style={styles.inviteHandle}>@{f.username}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.inviteBtn} onPress={() => handleInvite(f.id)}>
                  <Text style={styles.inviteBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {showInvite && nonParticipantFriends.length === 0 && (
          <Text style={styles.noFriendsText}>All your friends are already in this plan!</Text>
        )}
      </AnimatedCard>

      {/* Photos */}
      {plan.status === 'confirmed' && (
        <AnimatedCard index={3} style={{ marginBottom: Spacing.md }}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <TouchableOpacity
              onPress={handleAddPhoto}
              disabled={uploadingPhoto}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="camera-outline" size={16} color={Colors.primary} />
              <Text style={styles.inviteToggle}>{uploadingPhoto ? 'Uploading...' : 'Add Photo'}</Text>
            </TouchableOpacity>
          </View>
          {plan.photos?.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(plan.photos as string[]).map((url: string, i: number) => (
                  <Image key={i} source={{ uri: url }} style={styles.photoThumb} resizeMode="cover" />
                ))}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.photoEmpty}>
              <Ionicons name="images-outline" size={36} color={Colors.textMuted} style={{ marginBottom: 6 }} />
              <Text style={styles.photoEmptyText}>No photos yet. Be the first to add one!</Text>
            </View>
          )}
        </AnimatedCard>
      )}

      {/* Checklist */}
      {(() => {
        const checklistMap: Record<string, { text: string; completedBy: string | null; addedBy: string }> = plan.checklist || {};
        const checklistEntries = Object.entries(checklistMap).map(([cid, item]) => ({ id: cid, ...item }));
        const doneCount = checklistEntries.filter((i) => !!i.completedBy).length;
        return (
          <AnimatedCard index={4} style={{ marginBottom: Spacing.md }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Checklist</Text>
              {checklistEntries.length > 0 && (
                <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: '600' }}>
                  {doneCount}/{checklistEntries.length} done
                </Text>
              )}
            </View>

            <View style={styles.checklistInputRow}>
              <TextInput
                style={styles.checklistInput}
                value={newChecklistItem}
                onChangeText={setNewChecklistItem}
                placeholder="Add an item..."
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={handleAddChecklistItem}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={handleAddChecklistItem}
                style={[styles.checklistAddBtn, !newChecklistItem.trim() && { opacity: 0.4 }]}
                disabled={!newChecklistItem.trim()}
              >
                <Ionicons name="add" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {checklistEntries.length === 0 ? (
              <View style={styles.checklistEmpty}>
                <Ionicons name="checkbox-outline" size={32} color={Colors.textMuted} style={{ marginBottom: 6 }} />
                <Text style={styles.checklistEmptyText}>No items yet. Add something above!</Text>
              </View>
            ) : (
              checklistEntries.map((item, idx) => {
                const isDone = !!item.completedBy;
                const completerName = item.completedBy ? (participantNames[item.completedBy] || 'Someone') : null;
                const canDelete = item.addedBy === uid || isCreator;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.checklistItem, idx === checklistEntries.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => handleToggleChecklistItem(item.id, item.completedBy)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checklistCircle, isDone && styles.checklistCircleDone]}>
                      {isDone && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.checklistItemText, isDone && styles.checklistItemTextDone]}>
                        {item.text}
                      </Text>
                      {isDone && completerName && (
                        <Text style={styles.checklistCompletedBy}>Done by {completerName}</Text>
                      )}
                    </View>
                    {canDelete && (
                      <TouchableOpacity
                        onPress={() => handleDeleteChecklistItem(item.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </AnimatedCard>
        );
      })()}

      {/* Comments */}
      {(() => {
        const commentsMap: Record<string, { text: string; authorId: string; authorName: string; timestamp: number }> = plan.comments || {};
        const commentEntries = Object.entries(commentsMap)
          .map(([cid, c]) => ({ id: cid, ...c }))
          .sort((a, b) => a.timestamp - b.timestamp);
        return (
          <AnimatedCard index={5} style={{ marginBottom: Spacing.md }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Comments</Text>
              {commentEntries.length > 0 && (
                <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: '600' }}>
                  {commentEntries.length}
                </Text>
              )}
            </View>

            {commentEntries.map((comment, idx) => {
              const isOwn = comment.authorId === uid;
              const canDelete = isOwn || isCreator;
              return (
                <View
                  key={comment.id}
                  style={[styles.commentItem, idx === commentEntries.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <View style={styles.commentAvatar}>
                    <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 12 }}>
                      {comment.authorName[0]?.toUpperCase() || '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={styles.commentAuthor}>{isOwn ? 'You' : comment.authorName}</Text>
                      <Text style={styles.commentTime}>
                        {(() => {
                          const diff = Date.now() - comment.timestamp;
                          if (diff < 60000) return 'just now';
                          if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
                          if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
                          return `${Math.floor(diff / 86400000)}d`;
                        })()}
                      </Text>
                    </View>
                    <Text style={styles.commentText}>{comment.text}</Text>
                  </View>
                  {canDelete && (
                    <TouchableOpacity
                      onPress={() => handleDeleteComment(comment.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {commentEntries.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <Ionicons name="chatbubble-outline" size={28} color={Colors.textMuted} style={{ marginBottom: 6 }} />
                <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm }}>No comments yet</Text>
              </View>
            )}

            <View style={[styles.checklistInputRow, { marginTop: 12, marginBottom: 0 }]}>
              <TextInput
                style={styles.checklistInput}
                value={newComment}
                onChangeText={setNewComment}
                placeholder="Add a comment..."
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={handleAddComment}
                returnKeyType="send"
              />
              <TouchableOpacity
                onPress={handleAddComment}
                style={[styles.checklistAddBtn, !newComment.trim() && { opacity: 0.4 }]}
                disabled={!newComment.trim()}
              >
                <Ionicons name="send" size={18} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </AnimatedCard>
        );
      })()}

      {/* Safety Tips Card */}
      {plan.status === 'confirmed' && plan.isPublic && isParticipant && planDateNotPassed && (
        <AnimatedCard index={99} accentColor={Colors.success} style={{ marginBottom: Spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.success} />
            <Text style={[styles.sectionTitle, { marginBottom: 0, color: Colors.success }]}>Stay Safe</Text>
          </View>
          <View style={styles.safetyTipRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.safetyTipText}>Meet somewhere public first</Text>
          </View>
          <View style={styles.safetyTipRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.safetyTipText}>Share this plan with a trusted contact</Text>
          </View>
          <View style={styles.safetyTipRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.safetyTipText}>Trust your gut — it's okay to leave</Text>
          </View>
        </AnimatedCard>
      )}
    </>
  );

  // ─── Poll tab content ───────────────────────────────────────────────────────
  const renderPoll = () => {
    if (!plan.poll) {
      return (
        <View style={styles.tabEmptyState}>
          <Ionicons name="bar-chart-outline" size={40} color={Colors.textMuted} style={{ marginBottom: 12 }} />
          <Text style={styles.tabEmptyTitle}>No poll for this plan</Text>
          <Text style={styles.tabEmptyText}>The host hasn't added a poll yet.</Text>
        </View>
      );
    }
    return (
      <AnimatedCard index={0} style={{ marginBottom: Spacing.md }}>
        <Text style={styles.sectionTitle}>{plan.poll.question}</Text>
        {plan.poll.options.map((opt: string) => {
          const votes: string[] = plan.poll.votes?.[opt] || [];
          const totalVotes = plan.poll.options.reduce(
            (sum: number, o: string) => sum + (plan.poll.votes?.[o]?.length || 0), 0
          );
          const hasVotedForThis = votes.includes(uid);
          const percentage = totalVotes > 0 ? Math.round((votes.length / totalVotes) * 100) : 0;
          return (
            <TouchableOpacity key={opt} style={styles.pollOption} onPress={() => handlePollVote(opt)}>
              <View style={[styles.pollOptionFill, { width: `${percentage}%` as any }]} />
              <Text style={[styles.pollOptionText, hasVotedForThis && styles.pollOptionTextActive]}>{opt}</Text>
              <Text style={styles.pollOptionPct}>{votes.length} {hasVotedForThis ? '✓' : ''}</Text>
            </TouchableOpacity>
          );
        })}
      </AnimatedCard>
    );
  };

  // ─── Chat tab content ───────────────────────────────────────────────────────
  const renderChat = () => (
    <AnimatedCard index={0} style={{ marginBottom: Spacing.md }}>
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() => router.push({ pathname: '/chat', params: { planId: plan.id, planTitle: plan.title } })}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.chatCardTitle}>Plan Chat</Text>
          <Text style={styles.chatCardSub}>Discuss this plan with participants</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={Colors.textMuted} />
      </TouchableOpacity>
    </AnimatedCard>
  );

  // ─── Moments tab content ────────────────────────────────────────────────────
  const renderMoments = () => {
    if (plan.status !== 'confirmed') {
      return (
        <View style={styles.tabEmptyState}>
          <Ionicons name="lock-closed-outline" size={40} color={Colors.textMuted} style={{ marginBottom: 12 }} />
          <Text style={styles.tabEmptyTitle}>Moments are locked</Text>
          <Text style={styles.tabEmptyText}>Moments unlock after the plan is confirmed</Text>
        </View>
      );
    }
    return <MomentsGallery planId={plan.id} isParticipant={isParticipant} />;
  };

  return (
    <ScreenWrapper>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Cover image with floating header */}
        <View style={styles.coverWrapper}>
          {plan.coverUrl ? (
            <Image source={{ uri: plan.coverUrl }} style={styles.heroCover} resizeMode="cover" />
          ) : (
            <View style={styles.heroCoverPlaceholder} />
          )}
          <View style={styles.floatHeader}>
            <TouchableOpacity style={styles.floatBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.floatBtn} onPress={() => setShowSOS(true)}>
                <Ionicons name="shield-outline" size={20} color={Colors.error} />
              </TouchableOpacity>
              {plan && uid !== plan.createdBy && (
                <TouchableOpacity style={styles.floatBtn} onPress={() => setShowReport(true)}>
                  <Ionicons name="flag-outline" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.floatBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsBar}>
          {DETAIL_TABS.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setActiveTab(t)}
              style={[styles.detailTab, activeTab === t && styles.detailTabActive]}
            >
              <Text style={[styles.detailTabLabel, activeTab === t && styles.detailTabLabelActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {activeTab === 'Overview' && renderOverview()}
          {activeTab === 'Poll' && renderPoll()}
          {activeTab === 'Chat' && renderChat()}
          {activeTab === 'Moments' && renderMoments()}
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={showEdit} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit Plan</Text>
              <TextInput
                style={styles.modalInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Title"
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                value={editDesc}
                onChangeText={setEditDesc}
                placeholder="Description"
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <TextInput
                style={styles.modalInput}
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="Location"
                placeholderTextColor={Colors.textMuted}
              />
              <TouchableOpacity style={styles.modalInput} onPress={() => setShowEditDatePicker(true)}>
                <Text style={{ color: editDate ? Colors.text : Colors.textMuted }}>
                  {editDate
                    ? editDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                    : plan?.date || 'Pick a date'}
                </Text>
              </TouchableOpacity>
              {Platform.OS === 'android' && showEditDatePicker && (
                <DateTimePicker
                  value={editDate || new Date()}
                  mode="date"
                  minimumDate={new Date()}
                  onChange={(_, d) => { setShowEditDatePicker(false); if (d) setEditDate(d); }}
                />
              )}
              {Platform.OS === 'ios' && showEditDatePicker && (
                <DateTimePicker
                  value={editDate || new Date()}
                  mode="date"
                  minimumDate={new Date()}
                  display="spinner"
                  onChange={(_, d) => { if (d) setEditDate(d); }}
                  style={{ backgroundColor: Colors.background }}
                />
              )}

              <Text style={styles.modalLabel}>Category</Text>
              <View style={styles.catRow}>
                <TouchableOpacity
                  style={[styles.catChip, !editCategory && !editUsingCustomCategory && styles.catChipActive]}
                  onPress={() => { setEditCategory(''); setEditUsingCustomCategory(false); }}
                >
                  <Text style={[styles.catChipText, !editCategory && !editUsingCustomCategory && styles.catChipTextActive]}>None</Text>
                </TouchableOpacity>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catChip, editCategory === c && !editUsingCustomCategory && styles.catChipActive]}
                    onPress={() => { setEditUsingCustomCategory(false); setEditCategory(c); }}
                  >
                    <Text style={[styles.catChipText, editCategory === c && !editUsingCustomCategory && styles.catChipTextActive]}>{CATEGORY_EMOJI[c]} {c}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.catChip, editUsingCustomCategory && styles.catChipActive]}
                  onPress={() => { setEditUsingCustomCategory(true); setEditCategory(''); }}
                >
                  <Text style={[styles.catChipText, editUsingCustomCategory && styles.catChipTextActive]}>Custom</Text>
                </TouchableOpacity>
              </View>
              {editUsingCustomCategory && (
                <TextInput
                  style={styles.modalInput}
                  value={editCategory}
                  onChangeText={setEditCategory}
                  placeholder="e.g. Hiking, Coding, Book Club..."
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                  maxLength={40}
                />
              )}

              <Text style={styles.modalLabel}>Visibility</Text>
              <View style={styles.visibilityRow}>
                <TouchableOpacity
                  style={[styles.visibilityBtn, editIsPublic && styles.visibilityBtnActive]}
                  onPress={() => setEditIsPublic(true)}
                >
                  <Text style={[styles.visibilityBtnText, editIsPublic && styles.visibilityBtnTextActive]}>Public</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.visibilityBtn, !editIsPublic && styles.visibilityBtnActive]}
                  onPress={() => setEditIsPublic(false)}
                >
                  <Text style={[styles.visibilityBtnText, !editIsPublic && styles.visibilityBtnTextActive]}>Private</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setShowEdit(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={handleSaveEdit} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color={Colors.text} />
                  ) : (
                    <Text style={styles.modalSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Confetti particles */}
      <ConfettiParticles ref={confettiRef} />

      {/* Celebration banner */}
      <Animated.View
        style={[styles.celebration, { transform: [{ scale: celebrationScale }], opacity: celebrationOpacity }]}
        pointerEvents="none"
      >
        <Text style={styles.celebrationText}>Quorum Reached!</Text>
        <Text style={styles.celebrationSub}>This plan is confirmed</Text>
      </Animated.View>

      <ReportModal
        visible={showReport}
        planId={plan?.id || ''}
        planTitle={plan?.title}
        onClose={() => setShowReport(false)}
      />

      {/* Safety Timer Modal */}
      <SafetyTimerModal
        visible={showSafetyTimer}
        onClose={() => setShowSafetyTimer(false)}
        onStarted={(notifId, endsAt) => {
          setTimerNotifId(notifId);
          setTimerEndsAt(endsAt);
          setTimerActive(true);
          showToast('Safety timer started');
        }}
        planTitle={plan?.title || ''}
        planId={plan?.id || ''}
      />

      {/* SOS Modal */}
      <Modal visible={showSOS} transparent animationType="slide" onRequestClose={() => setShowSOS(false)}>
        <View style={sosStyles.overlay}>
          <View style={sosStyles.sheet}>
            <View style={sosStyles.handle} />
            <View style={sosStyles.header}>
              <Ionicons name="shield-outline" size={28} color={Colors.error} />
              <Text style={sosStyles.title}>Emergency SOS</Text>
            </View>
            <View style={sosStyles.infoCard}>
              <Text style={sosStyles.infoLabel}>CURRENT PLAN</Text>
              <Text style={sosStyles.infoValue}>{plan?.title}</Text>
              {plan?.location ? (
                <Text style={sosStyles.infoSub}>
                  {plan.location}
                </Text>
              ) : null}
              {plan?.date ? (
                <Text style={sosStyles.infoSub}>
                  {plan.date}
                </Text>
              ) : null}
            </View>
            {emergencyContact ? (
              <View style={sosStyles.contactCard}>
                <Text style={sosStyles.infoLabel}>EMERGENCY CONTACT</Text>
                <Text style={sosStyles.contactName}>{emergencyContact.name}</Text>
                <Text style={sosStyles.contactPhone}>{emergencyContact.phone}</Text>
              </View>
            ) : (
              <Text style={sosStyles.noContact}>No emergency contact set. Add one in your Profile.</Text>
            )}
            <TouchableOpacity
              style={sosStyles.copyBtn}
              onPress={() => Share.share({ message: plan?.location || '' })}
            >
              <Ionicons name="copy-outline" size={18} color={Colors.text} style={{ marginRight: 8 }} />
              <Text style={sosStyles.copyBtnText}>Share Location</Text>
            </TouchableOpacity>
            {emergencyContact?.phone ? (
              <TouchableOpacity
                style={sosStyles.callBtn}
                onPress={() => Linking.openURL(`tel:${emergencyContact.phone}`)}
              >
                <Ionicons name="call-outline" size={18} color={Colors.text} style={{ marginRight: 8 }} />
                <Text style={sosStyles.callBtnText}>Call {emergencyContact.name}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={sosStyles.closeBtn} onPress={() => setShowSOS(false)}>
              <Text style={sosStyles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  loadingHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  menuBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, flex: 1, textAlign: 'center' },
  content: { paddingBottom: 40 },
  // Cover / float header
  coverWrapper: { position: 'relative' },
  heroCover: { width: '100%', height: 220 },
  heroCoverPlaceholder: { width: '100%', height: 140, backgroundColor: Colors.surfaceRaised },
  floatHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 16, zIndex: 10,
  },
  floatBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  // Tabs
  tabsBar: { paddingHorizontal: 16, gap: 8, paddingVertical: 8 },
  detailTab: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 99,
    backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.glassBorder,
  },
  detailTabActive: { backgroundColor: Colors.primaryDim, borderColor: Colors.primaryBorder },
  detailTabLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted },
  detailTabLabelActive: { color: Colors.primary },
  tabContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  // Tab empty states
  tabEmptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: Spacing.xl },
  tabEmptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 6 },
  tabEmptyText: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center' },
  // Plan info
  coverImage: { width: '100%', height: 140, borderRadius: Radius.md, marginBottom: 12 },
  planTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  planTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text, flex: 1 },
  categoryTag: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600', marginTop: 4 },
  planDesc: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: 12, lineHeight: 22 },
  metaGrid: { gap: 8, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: FontSize.md, color: Colors.textSecondary },
  reactionsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  reactionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 99, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  reactionBtnActive: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  reactionCountActive: { color: Colors.primary },
  creatorActions: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  editBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  editBtnText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  archiveBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.gold + '22', borderWidth: 1, borderColor: Colors.gold + '44',
  },
  archiveBtnText: { color: Colors.gold, fontWeight: '600', fontSize: FontSize.sm },
  deleteBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.error + '22', borderWidth: 1, borderColor: Colors.error + '44',
  },
  deleteBtnText: { color: Colors.error, fontWeight: '600', fontSize: FontSize.sm },
  leaveBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  leaveBtnText: { color: Colors.textMuted, fontWeight: '600', fontSize: FontSize.sm },
  calendarBtn: {
    marginTop: 8, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.success + '22', borderWidth: 1, borderColor: Colors.success + '44',
    flexDirection: 'row', justifyContent: 'center',
  },
  calendarBtnText: { color: Colors.success, fontWeight: '700', fontSize: FontSize.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  inviteToggle: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  pollOption: {
    flexDirection: 'row', alignItems: 'center', borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8, height: 44, position: 'relative',
  },
  pollOptionFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: Colors.primary + '33', borderRadius: Radius.md,
  },
  pollOptionText: { flex: 1, paddingHorizontal: 12, color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.md },
  pollOptionTextActive: { color: Colors.primary },
  pollOptionPct: { paddingHorizontal: 12, color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: '700' },
  chatCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatCardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  chatCardSub: { fontSize: FontSize.sm, color: Colors.textSecondary },
  participantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  participantAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center',
  },
  participantName: { flex: 1, color: Colors.text, fontSize: FontSize.md },
  votedBadge: { backgroundColor: Colors.success + '33', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  votedText: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '700' },
  inviteSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  inviteSectionTitle: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: 8 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 },
  inviteHandle: { color: Colors.primary, fontSize: FontSize.xs },
  inviteBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99,
    backgroundColor: Colors.primary + '22', borderWidth: 1, borderColor: Colors.primary + '44',
  },
  inviteBtnText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  noFriendsText: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 8, textAlign: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContent: {
    backgroundColor: Colors.card, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 40,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  modalInput: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 12,
    color: Colors.text, fontSize: FontSize.md, justifyContent: 'center',
  },
  modalLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  visibilityRow: { flexDirection: 'row', gap: 10 },
  visibilityBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  visibilityBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  visibilityBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.sm },
  visibilityBtnTextActive: { color: Colors.text },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  catChipTextActive: { color: Colors.text },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancel: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  modalCancelText: { color: Colors.textSecondary, fontWeight: '600' },
  modalSave: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.primary },
  modalSaveText: { color: Colors.text, fontWeight: '700' },
  celebration: {
    position: 'absolute', top: '35%', alignSelf: 'center',
    backgroundColor: Colors.gold, paddingHorizontal: 30, paddingVertical: 20,
    borderRadius: Radius.xl, alignItems: 'center',
    shadowColor: Colors.gold, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  celebrationText: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.background },
  celebrationSub: { fontSize: FontSize.sm, color: Colors.background, marginTop: 4, opacity: 0.8 },
  inviteCodeSection: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  inviteCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteCodeLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  inviteCodeBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primary + '22', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary + '44',
  },
  inviteCodeText: { color: Colors.primary, fontWeight: '800', fontSize: FontSize.md, letterSpacing: 2 },
  photoThumb: { width: 90, height: 90, borderRadius: Radius.md },
  photoEmpty: { alignItems: 'center', paddingVertical: 20 },
  photoEmptyText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
  checklistInputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  checklistInput: {
    flex: 1, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10,
    color: Colors.text, fontSize: FontSize.md,
  },
  checklistAddBtn: {
    width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  checklistItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '55',
  },
  checklistCircle: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checklistCircleDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  checklistItemText: { fontSize: FontSize.md, color: Colors.text, fontWeight: '500' },
  checklistItemTextDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  checklistCompletedBy: { fontSize: FontSize.xs, color: Colors.success, marginTop: 2, fontWeight: '600' },
  checklistEmpty: { alignItems: 'center', paddingVertical: 20 },
  checklistEmptyText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
  commentItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '55',
  },
  commentAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary + '44',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
  },
  commentAuthor: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  commentTime: { fontSize: FontSize.xs, color: Colors.textMuted },
  commentText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 20 },
  ratingCard: {
    backgroundColor: Colors.gold + '12',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gold + '44',
    padding: Spacing.md,
    marginTop: Spacing.sm,
    gap: 10,
  },
  ratingCardHeader: { flexDirection: 'row', alignItems: 'center' },
  ratingCardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.gold },
  ratingCardSub: { fontSize: FontSize.sm, color: Colors.textSecondary },
  ratingSubmitBtn: {
    backgroundColor: Colors.gold,
    paddingVertical: 10,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  ratingSubmitText: { color: Colors.background, fontWeight: '700', fontSize: FontSize.sm },
  scamBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.error + '22',
    borderWidth: 1,
    borderColor: Colors.error + '44',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: 10,
  },
  scamBannerText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.error,
    lineHeight: 18,
  },
  tellFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  tellFriendText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  timerActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '18',
    borderWidth: 1,
    borderColor: Colors.success + '44',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: 8,
    gap: 10,
  },
  timerActiveTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.success,
  },
  timerCountdown: {
    fontSize: FontSize.xs,
    color: Colors.success,
    marginTop: 2,
  },
  imSafeBtn: {
    backgroundColor: Colors.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  imSafeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  safetyTimerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  safetyTimerBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  safetyTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  safetyTipText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
});

const sosStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.md,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.error,
  },
  infoCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  infoSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  contactCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.error + '44',
  },
  contactName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  contactPhone: {
    fontSize: FontSize.md,
    color: Colors.primary,
    marginTop: 2,
  },
  noContact: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardElevated,
    borderRadius: Radius.full,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  copyBtnText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.error,
    borderRadius: Radius.full,
    paddingVertical: 14,
    marginBottom: 10,
  },
  callBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  closeBtnText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
});
