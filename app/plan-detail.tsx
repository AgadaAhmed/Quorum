import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as Calendar from 'expo-calendar';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import PlanBanner from '../components/PlanBanner';
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
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, storage } from '../lib/firebase';
import { isAtTemplatesLimit, isAtMomentsLimit } from '../lib/subscription';
import { inviteShareMessage } from '../lib/invite';
import { useSubscription } from '../hooks/useSubscription';
import PaywallModal from '../components/PaywallModal';
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
import ReactionButton from '../components/plan-detail/ReactionButton';
import ChecklistRow from '../components/plan-detail/ChecklistRow';
import PollTab from '../components/plan-detail/PollTab';
import SOSModal from '../components/plan-detail/SOSModal';
import EditPlanModal from '../components/plan-detail/EditPlanModal';
import {
  Notifications,
  REACTIONS,
  DetailTab,
  VisibleTab,
  Friend,
  ChecklistItem,
  CommentEntry,
  ONE_HOUR_MS,
  ONE_DAY_MS,
  AVATAR_OVERLAP,
  MAX_VISIBLE_AVATARS,
  HIT_SLOP,
  formatTimeAgo,
} from '../components/plan-detail/shared';

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
  const [voting, setVoting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [newComment, setNewComment] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [hostRating, setHostRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [creatorUsername, setCreatorUsername] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('Overview');

  const visibleTabs = useMemo(() => {
    const tabs: VisibleTab[] = [{ key: 'Overview', label: 'Overview' }];
    if (plan?.poll?.question) tabs.push({ key: 'Poll', label: 'Poll' });
    tabs.push({ key: 'Chat', label: 'Chat' });
    if (plan?.status === 'confirmed') tabs.push({ key: 'Moments', label: 'Moments' });
    return tabs;
  }, [plan?.poll?.question, plan?.status]);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab('Overview');
    }
  }, [visibleTabs, activeTab]);

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

  const [uid, setUid] = useState(auth.currentUser?.uid || '');
  const { isPro } = useSubscription();
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid || ''));
  }, []);

  const fetchParticipantNames = useCallback(async (participantIds: string[]) => {
    if (!participantIds.length) return;
    const names: Record<string, string> = {};
    await Promise.all(
      participantIds.map(async (pid) => {
        try {
          const snap = await getDoc(doc(db, 'users', pid));
          const data = snap.data();
          names[pid] = data?.displayName || data?.username || 'Unknown';
        } catch {
          names[pid] = 'Unknown';
        }
      })
    );
    setParticipantNames((prev) => ({ ...prev, ...names }));
  }, []);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(db, 'plans', id),
      (snap) => {
        if (!snap.exists()) {
          setPlan(null);
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setPlan(data);
        setLoading(false);
        fetchParticipantNames((data as any).participants || []);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [id, fetchParticipantNames]);

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
      setCreatorUsername(snap.data()?.username || '');
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

  useEffect(() => {
    if (!auth.currentUser) router.replace('/(auth)/login');
  }, [router]);

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
      const notifAt = eventDate.getTime() - ONE_DAY_MS;
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
    // Deps are the exact plan fields this effect reads; depending on the whole
    // `plan` object would re-run it (an extra getDoc) on every snapshot update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.status, plan?.isPublic, plan?.participants, plan?.date, plan?.title, id, uid]);

  const handleVote = async () => {
    if (!plan || voting) return;
    setVoting(true);
    const planRef = doc(db, 'plans', plan.id);
    const hasVoted = plan.votes?.includes(uid);
    Haptics.impactAsync(hasVoted ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await updateDoc(planRef, { votes: hasVoted ? arrayRemove(uid) : arrayUnion(uid) });
      // Re-read from server to get authoritative vote count before confirming
      const freshSnap = await getDoc(planRef);
      const freshVotes: string[] = freshSnap.data()?.votes || [];
      const freshRequired: number = freshSnap.data()?.requiredVotes || plan.requiredVotes;
      const freshStatus: string = freshSnap.data()?.status || plan.status;
      if (!hasVoted && freshVotes.length >= freshRequired && freshStatus !== 'confirmed') {
        await updateDoc(planRef, { status: 'confirmed' });
        triggerCelebration();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Quorum Reached!',
            body: `"${plan.title}" has enough votes — it's confirmed!`,
            data: { planId: plan.id },
          },
          trigger: null,
        });
        if (plan.dateTimestamp) {
          const planDate = new Date(plan.dateTimestamp);
          const now = Date.now();
          const oneDayBefore = planDate.getTime() - ONE_DAY_MS;
          const oneHourBefore = planDate.getTime() - ONE_HOUR_MS;
          if (oneDayBefore > now) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Plan Tomorrow!',
                body: `"${plan.title}" is happening tomorrow. Get ready!`,
                data: { planId: plan.id },
              },
              trigger: { seconds: Math.floor((oneDayBefore - now) / 1000) } as any,
            });
          }
          if (oneHourBefore > now) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Plan in 1 hour!',
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

  const handleReact = useCallback(async (emoji: string) => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const reactionKey = `reactions.${emoji}`;
    const currentReactions: string[] = plan.reactions?.[emoji] || [];
    const hasReacted = currentReactions.includes(uid);
    try {
      await updateDoc(doc(db, 'plans', plan.id), {
        [reactionKey]: hasReacted ? arrayRemove(uid) : arrayUnion(uid),
      });
    } catch {
      showToast('Failed to react', 'error');
    }
  }, [plan, uid, showToast]);

  const handleInvite = async (friendId: string) => {
    if (!plan) return;
    // Only the creator can invite; friendId must be in the user's actual friends list
    if (plan.createdBy !== uid) { showToast('Only the creator can invite', 'error'); return; }
    if (!friends.find((f) => f.id === friendId)) { showToast('You can only invite your friends', 'error'); return; }
    Haptics.selectionAsync();
    try {
      await updateDoc(doc(db, 'plans', plan.id), { participants: arrayUnion(friendId) });
      showToast('Friend invited!');
    } catch {
      showToast('Failed to invite friend', 'error');
    }
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
    const text = `Check out this plan on Quorum!\n\nPlan: ${plan.title}${plan.description ? `\n${plan.description}` : ''}${plan.date ? `\nDate: ${plan.date}` : ''}${plan.location ? `\nLocation: ${plan.location}` : ''}\n\nVotes: ${plan.votes?.length || 0}/${plan.requiredVotes}`;
    try {
      await Sharing.shareAsync('data:text/plain;base64,' + btoa(text), { mimeType: 'text/plain', dialogTitle: 'Share Plan' });
    } catch {
      Alert.alert('Share', text);
    }
  };

  const handleAddPhoto = async () => {
    if (isAtMomentsLimit((plan?.photos?.length || 0), isPro ? 'pro' : 'free')) {
      setShowPaywall(true);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showToast('Photo library access denied', 'error'); return; }
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
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      const existing: any[] = snap.data()?.templates || [];
      if (isAtTemplatesLimit(existing.length, isPro ? 'pro' : 'free')) {
        setShowPaywall(true);
        return;
      }
      await updateDoc(userRef, { templates: [...existing, template] });
      showToast('Saved as template!');
    } catch {
      showToast('Failed to save template', 'error');
    }
  };

  const handleTellFriend = () => {
    if (!plan) return;
    Share.share({
      message: `I'm going to "${plan.title}"${plan.date ? ` on ${plan.date}` : ''}${plan.location ? ` at ${plan.location}` : ''}. If you don't hear from me after, check on me! (Sent from Quorum)`,
    }).catch(() => {});
  };

  const handleShareCode = () => {
    if (!plan?.inviteCode) return;
    Share.share({
      message: inviteShareMessage(plan.title, plan.inviteCode),
    }).catch(() => {});
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
    const text = newChecklistItem.trim().slice(0, 200);
    setNewChecklistItem('');
    try {
      await updateDoc(doc(db, 'plans', plan.id), {
        [`checklist.${itemId}`]: { text, completedBy: null, addedBy: uid },
      });
    } catch {
      setNewChecklistItem(text);
      showToast('Failed to add item', 'error');
    }
  };

  const handleToggleChecklistItem = useCallback(async (itemId: string, completedBy: string | null) => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateDoc(doc(db, 'plans', plan.id), {
        [`checklist.${itemId}.completedBy`]: completedBy ? null : uid,
      });
    } catch {
      showToast('Failed to update item', 'error');
    }
  }, [plan, uid, showToast]);

  const handleDeleteChecklistItem = useCallback(async (itemId: string) => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await updateDoc(doc(db, 'plans', plan.id), {
        [`checklist.${itemId}`]: deleteField(),
      });
    } catch {
      showToast('Failed to delete item', 'error');
    }
  }, [plan, showToast]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !plan) return;
    Haptics.selectionAsync();
    const commentId = `${uid}_${Date.now()}`;
    const myName = participantNames[uid] || auth.currentUser?.email?.split('@')[0] || 'You';
    const text = newComment.trim().slice(0, 500);
    setNewComment('');
    try {
      await updateDoc(doc(db, 'plans', plan.id), {
        [`comments.${commentId}`]: {
          text,
          authorId: uid,
          authorName: myName.slice(0, 50),
          timestamp: Date.now(),
        },
      });
    } catch {
      setNewComment(text);
      showToast('Failed to add comment', 'error');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await updateDoc(doc(db, 'plans', plan.id), {
        [`comments.${commentId}`]: deleteField(),
      });
    } catch {
      showToast('Failed to delete comment', 'error');
    }
  };

  const triggerCelebration = () => {
    confettiRef.current?.fire({ accent: true });
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
  const nonParticipantFriends = useMemo(
    () => friends.filter((f) => !plan?.participants?.includes(f.id)),
    [friends, plan?.participants]
  );
  const isParticipant = plan?.participants?.includes(uid) === true;
  const scamFlagged = useMemo(
    () => hasScamKeywords((plan?.title || '') + ' ' + (plan?.description || '')),
    [plan?.title, plan?.description]
  );
  const planDateMs = plan?.date ? new Date(plan.date).getTime() : NaN;
  const planDateNotPassed = !isNaN(planDateMs) && planDateMs > Date.now();

  const checklistEntries = useMemo(() => {
    const map: Record<string, ChecklistItem> = plan?.checklist || {};
    return Object.entries(map).map(([cid, item]) => ({ id: cid, ...item }));
  }, [plan?.checklist]);
  const checklistDoneCount = useMemo(
    () => checklistEntries.filter((i) => !!i.completedBy).length,
    [checklistEntries]
  );

  const commentEntries = useMemo(() => {
    const map: Record<string, CommentEntry> = plan?.comments || {};
    return Object.entries(map)
      .map(([cid, c]) => ({ id: cid, ...c }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [plan?.comments]);

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.loadingHeader}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.menuBtn}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Plan Detail</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.loadingBody}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </ScreenWrapper>
    );
  }

  if (!plan) {
    return (
      <ScreenWrapper>
        <View style={styles.loadingHeader}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.menuBtn}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Plan Detail</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.notFoundState}>
          <View style={styles.notFoundIconWrap}>
            <Ionicons name="calendar-clear-outline" size={36} color={Colors.textMuted} />
          </View>
          <Text style={styles.notFoundTitle}>Plan not found</Text>
          <Text style={styles.notFoundText}>
            This plan may have been deleted, or you no longer have access to it.
          </Text>
          <TouchableOpacity
            style={styles.notFoundBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Back to plans"
          >
            <Text style={styles.notFoundBtnText}>Back to Plans</Text>
          </TouchableOpacity>
        </View>
      </ScreenWrapper>
    );
  }

  // ─── Overview tab content ───────────────────────────────────────────────────
  const renderOverview = () => (
    <>
      {/* Plan Info */}
      <AnimatedCard index={0} style={{ marginBottom: Spacing.md }}>
        <Text style={styles.upcomingLabel}>{plan.status === 'confirmed' ? 'CONFIRMED PLAN' : 'UPCOMING PLAN'}</Text>
        <Text style={styles.planTitle}>{plan.title}</Text>
        {plan.category ? (
          <View style={styles.categoryTagRow}>
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText}>{plan.category}</Text>
            </View>
          </View>
        ) : null}
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

        <View style={styles.statusBadgeRow}>
          {plan.status === 'confirmed' ? (
            <View style={styles.autoBadge}>
              <Text style={styles.autoBadgeText}>AUTO READY</Text>
            </View>
          ) : (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>
                {Math.max(0, (plan.requiredVotes || 3) - (plan.votes?.length || 0))} more needed
              </Text>
            </View>
          )}
        </View>

        {/* Tell a Friend */}
        <TouchableOpacity
          style={styles.tellFriendBtn}
          onPress={handleTellFriend}
          accessibilityRole="button"
          accessibilityLabel="Tell a friend you are attending"
        >
          <Ionicons name="people-outline" size={15} color={Colors.textSecondary} style={styles.iconMr6} />
          <Text style={styles.tellFriendText}>Tell a Friend</Text>
        </TouchableOpacity>

        {/* Reactions */}
        <View style={styles.reactionsRow}>
          {REACTIONS.map((emoji) => (
            <ReactionButton
              key={emoji}
              emoji={emoji}
              count={plan.reactions?.[emoji]?.length || 0}
              reacted={!!plan.reactions?.[emoji]?.includes(uid)}
              onPress={handleReact}
            />
          ))}
        </View>

        {/* LAST TIME... */}
        <View style={styles.lastTimeSection}>
          <Text style={styles.lastTimeLabelText}>LAST TIME...</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lastTimeScroll}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.lastTimePhoto} />
            ))}
          </ScrollView>
        </View>

        {/* Quorum Details Box */}
        <View style={styles.detailsBox}>
          <Text style={styles.detailsBoxLabel}>QUORUM DETAILS</Text>
          <View style={styles.detailsBoxRow}>
            <Text style={styles.detailsBoxKey}>HOST</Text>
            <Text style={styles.detailsBoxValue}>
              {creatorUsername ? `@${creatorUsername}` : creatorName || 'host'}
            </Text>
          </View>
          <View style={styles.detailsBoxDivider} />
          <View style={styles.detailsBoxRow}>
            <Text style={styles.detailsBoxKey}>SPOTS</Text>
            <Text style={styles.detailsBoxValue}>{plan.maxParticipants || 'Unlimited'}</Text>
          </View>
          <View style={styles.detailsBoxDivider} />
          <View style={styles.detailsBoxRow}>
            <Text style={styles.detailsBoxKey}>ENTRY</Text>
            <Text style={styles.detailsBoxValue}>Free</Text>
          </View>
          {plan.category ? (
            <>
              <View style={styles.detailsBoxDivider} />
              <View style={styles.detailsBoxRow}>
                <Text style={styles.detailsBoxKey}>TYPE</Text>
                <Text style={styles.detailsBoxValue}>{plan.category}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Creator actions */}
        {isCreator ? (
          <View style={styles.creatorActions}>
            <TouchableOpacity
              style={[styles.editBtn, styles.btnRow]}
              onPress={() => setShowEdit(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit plan"
            >
              <Ionicons name="create-outline" size={14} color={Colors.text} style={styles.iconMr4} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.archiveBtn, styles.btnRow]}
              onPress={handleArchive}
              accessibilityRole="button"
              accessibilityLabel={isArchived ? 'Restore plan' : 'Archive plan'}
            >
              <Ionicons name="archive-outline" size={14} color={Colors.gold} style={styles.iconMr4} />
              <Text style={styles.archiveBtnText}>{isArchived ? 'Restore' : 'Archive'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteBtn, styles.btnRow]}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete plan"
            >
              <Ionicons name="trash-outline" size={14} color={Colors.error} style={styles.iconMr4} />
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.creatorActions}>
            <TouchableOpacity
              style={[styles.archiveBtn, styles.btnRow]}
              onPress={handleArchive}
              accessibilityRole="button"
              accessibilityLabel={isArchived ? 'Restore plan' : 'Archive plan'}
            >
              <Ionicons name="archive-outline" size={14} color={Colors.gold} style={styles.iconMr4} />
              <Text style={styles.archiveBtnText}>{isArchived ? 'Restore' : 'Archive'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.leaveBtn, styles.btnRow]}
              onPress={handleLeave}
              accessibilityRole="button"
              accessibilityLabel="Leave plan"
            >
              <Ionicons name="exit-outline" size={14} color={Colors.textMuted} style={styles.iconMr4} />
              <Text style={styles.leaveBtnText}>Leave Plan</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Save as Template */}
        {isCreator && (
          <TouchableOpacity
            style={[styles.calendarBtn, styles.templateBtn]}
            onPress={handleSaveAsTemplate}
            accessibilityRole="button"
            accessibilityLabel="Save plan as template"
          >
            <Ionicons name="bookmark-outline" size={14} color={Colors.primary} style={styles.iconMr4} />
            <Text style={[styles.calendarBtnText, styles.templateBtnText]}>Save as Template</Text>
          </TouchableOpacity>
        )}

        {/* Invite Code */}
        {plan.inviteCode && (
          <View style={styles.inviteCodeSection}>
            <View style={styles.inviteCodeRow}>
              <Ionicons name="key-outline" size={14} color={Colors.primary} />
              <Text style={styles.inviteCodeLabel}>Invite Code</Text>
              <TouchableOpacity
                onPress={handleShareCode}
                style={styles.inviteCodeBadge}
                accessibilityRole="button"
                accessibilityLabel={`Share invite code ${plan.inviteCode}`}
              >
                <Text style={styles.inviteCodeText}>{plan.inviteCode}</Text>
                <Ionicons name="share-outline" size={12} color={Colors.primary} style={styles.iconMl6} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Calendar export (confirmed plans only) */}
        {plan.status === 'confirmed' && plan.dateTimestamp && (
          <TouchableOpacity
            style={[styles.calendarBtn, styles.btnRow]}
            onPress={handleAddToCalendar}
            accessibilityRole="button"
            accessibilityLabel="Add to calendar"
          >
            <Ionicons name="calendar-outline" size={14} color={Colors.success} style={styles.iconMr4} />
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
              <TouchableOpacity
                style={styles.imSafeBtn}
                onPress={handleImSafe}
                accessibilityRole="button"
                accessibilityLabel="Mark yourself safe and stop the check-in timer"
              >
                <Text style={styles.imSafeBtnText}>I&apos;m Safe</Text>
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
        <View style={styles.quorumHeader}>
          <Text style={styles.sectionTitleTight}>Quorum Progress</Text>
          <Text style={styles.quorumCount}>
            {voteCount}
            <Text style={styles.quorumCountDim}>/{required}</Text>
          </Text>
        </View>
        <Text style={styles.quorumSub}>
          {plan.status === 'confirmed'
            ? 'Quorum reached — this plan is confirmed'
            : `${Math.max(0, required - voteCount)} more ${Math.max(0, required - voteCount) === 1 ? 'vote' : 'votes'} to confirm`}
        </Text>
        <View style={styles.quorumBarWrap}>
          <QuorumProgressBar votes={voteCount} required={required} />
        </View>
        <AnimatedButton
          label={hasVoted ? "You're In — Withdraw" : "I'm In"}
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
        <Text style={styles.liveActivityLabel}>LIVE ACTIVITY</Text>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Participants ({plan.participants?.length || 0}{plan.maxParticipants ? `/${plan.maxParticipants}` : ''})
            {plan.maxParticipants && plan.participants?.length >= plan.maxParticipants ? ' · Full' : ''}
          </Text>
          {isCreator && (!plan.maxParticipants || plan.participants?.length < plan.maxParticipants) && (
            <TouchableOpacity
              onPress={() => setShowInvite(!showInvite)}
              style={styles.rowCenter}
              hitSlop={HIT_SLOP}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showInvite ? 'Done inviting' : 'Invite friends'}
            >
              <Ionicons name={showInvite ? 'checkmark' : 'person-add-outline'} size={16} color={Colors.primary} />
              <Text style={styles.inviteToggle}>{showInvite ? 'Done' : 'Invite'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* WHO'S IN strip */}
        {plan.participants && plan.participants.length > 0 && (
          <View style={styles.whoIsInSection}>
            <Text style={styles.whoIsInLabel}>WHO&apos;S IN</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.whoIsInScroll}
            >
              {plan.participants.slice(0, MAX_VISIBLE_AVATARS).map((pid: string, i: number) => {
                const pName = participantNames[pid];
                const initial = (pName?.[0] || pid.charAt(0) || '?').toUpperCase();
                return (
                  <View
                    key={pid}
                    style={[styles.whoIsInAvatar, i > 0 && styles.whoIsInAvatarOverlap]}
                    accessibilityLabel={pName || 'Participant'}
                  >
                    <Text style={styles.whoIsInInitial}>{initial}</Text>
                  </View>
                );
              })}
              {plan.participants.length > MAX_VISIBLE_AVATARS && (
                <View style={[styles.whoIsInAvatar, styles.whoIsInAvatarOverlap, styles.whoIsInAvatarMore]}>
                  <Text style={styles.whoIsInMoreText}>
                    +{plan.participants.length - MAX_VISIBLE_AVATARS}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {plan.participants?.map((pid: string) => {
          const name = participantNames[pid] || 'Loading...';
          const hasVotedP = plan.votes?.includes(pid);
          return (
            <View key={pid} style={styles.participantRow}>
              <TouchableOpacity
                style={styles.participantTouchable}
                onPress={() => pid !== uid && router.push({ pathname: '/user-profile', params: { userId: pid } } as any)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`View ${name}'s profile`}
              >
                <View style={styles.participantAvatar}>
                  <Text style={styles.avatarInitial}>{name[0]?.toUpperCase() || '?'}</Text>
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
                  <Text style={styles.avatarInitial}>{f.displayName?.[0]?.toUpperCase() || '?'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.flex1}
                  onPress={() => router.push({ pathname: '/user-profile', params: { userId: f.id } } as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${f.displayName}'s profile`}
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
              style={[styles.rowCenter, uploadingPhoto && styles.dim]}
              hitSlop={HIT_SLOP}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add photo"
            >
              {uploadingPhoto
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Ionicons name="camera-outline" size={16} color={Colors.primary} />}
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
      <AnimatedCard index={4} style={{ marginBottom: Spacing.md }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Checklist</Text>
          {checklistEntries.length > 0 && (
            <Text style={styles.countLabel}>
              {checklistDoneCount}/{checklistEntries.length} done
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
            maxLength={200}
          />
          <TouchableOpacity
            onPress={handleAddChecklistItem}
            style={[styles.checklistAddBtn, !newChecklistItem.trim() && styles.dim]}
            disabled={!newChecklistItem.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add checklist item"
          >
            <Ionicons name="add" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {checklistEntries.length === 0 ? (
          <View style={styles.checklistEmpty}>
            <Ionicons name="checkbox-outline" size={32} color={Colors.textMuted} style={styles.mb6} />
            <Text style={styles.checklistEmptyText}>No items yet. Add something above!</Text>
          </View>
        ) : (
          checklistEntries.map((item, idx) => (
            <ChecklistRow
              key={item.id}
              item={item}
              isLast={idx === checklistEntries.length - 1}
              completerName={item.completedBy ? (participantNames[item.completedBy] || 'Someone') : null}
              canDelete={item.addedBy === uid || isCreator}
              onToggle={handleToggleChecklistItem}
              onDelete={handleDeleteChecklistItem}
            />
          ))
        )}
      </AnimatedCard>

      {/* Comments */}
      <AnimatedCard index={5} style={{ marginBottom: Spacing.md }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Comments</Text>
          {commentEntries.length > 0 && (
            <Text style={styles.countLabel}>{commentEntries.length}</Text>
          )}
        </View>

        {commentEntries.map((comment, idx) => {
          const isOwn = comment.authorId === uid;
          const canDelete = isOwn || isCreator;
          return (
            <View
              key={comment.id}
              style={[styles.commentItem, idx === commentEntries.length - 1 && styles.noBorderBottom]}
            >
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>
                  {comment.authorName[0]?.toUpperCase() || '?'}
                </Text>
              </View>
              <View style={styles.flex1}>
                <View style={styles.commentHeaderRow}>
                  <Text style={styles.commentAuthor}>{isOwn ? 'You' : comment.authorName}</Text>
                  <Text style={styles.commentTime}>{formatTimeAgo(comment.timestamp)}</Text>
                </View>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
              {canDelete && (
                <TouchableOpacity
                  onPress={() => handleDeleteComment(comment.id)}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="Delete comment"
                >
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {commentEntries.length === 0 && (
          <View style={styles.commentsEmpty}>
            <Ionicons name="chatbubble-outline" size={28} color={Colors.textMuted} style={styles.mb6} />
            <Text style={styles.commentsEmptyText}>No comments yet</Text>
          </View>
        )}

        <View style={[styles.checklistInputRow, styles.commentInputRow]}>
          <TextInput
            style={styles.checklistInput}
            value={newComment}
            onChangeText={setNewComment}
            placeholder="Add a comment..."
            placeholderTextColor={Colors.textMuted}
            onSubmitEditing={handleAddComment}
            returnKeyType="send"
            maxLength={500}
          />
          <TouchableOpacity
            onPress={handleAddComment}
            style={[styles.checklistAddBtn, !newComment.trim() && styles.dim]}
            disabled={!newComment.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send comment"
          >
            <Ionicons name="send" size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </AnimatedCard>

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
            <Text style={styles.safetyTipText}>Trust your gut — it&apos;s okay to leave</Text>
          </View>
        </AnimatedCard>
      )}
    </>
  );

  // ─── Chat tab content ───────────────────────────────────────────────────────
  const renderChat = () => (
    <AnimatedCard index={0} style={{ marginBottom: Spacing.md }}>
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() => router.push({ pathname: '/chat', params: { planId: plan.id, planTitle: plan.title } })}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Open plan chat"
      >
        <View style={styles.chatCardIcon}>
          <Ionicons name="chatbubbles-outline" size={22} color={Colors.text} />
        </View>
        <View style={styles.flex1}>
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
          <PlanBanner category={plan.category} seed={plan.id} variant="hero" style={styles.heroCover} />
          <View style={styles.floatHeader}>
            <TouchableOpacity
              style={styles.floatBtn}
              onPress={() => router.back()}
              activeOpacity={0.7}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={Colors.background} />
            </TouchableOpacity>
            <View style={styles.floatActions}>
              <TouchableOpacity
                style={styles.floatBtn}
                onPress={() => setShowSOS(true)}
                activeOpacity={0.7}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Emergency SOS"
              >
                <Ionicons name="shield-outline" size={20} color={Colors.background} />
              </TouchableOpacity>
              {plan && uid !== plan.createdBy && (
                <TouchableOpacity
                  style={styles.floatBtn}
                  onPress={() => setShowReport(true)}
                  activeOpacity={0.7}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="Report this plan"
                >
                  <Ionicons name="flag-outline" size={20} color={Colors.background} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.floatBtn}
                onPress={handleShare}
                activeOpacity={0.7}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Share plan"
              >
                <Ionicons name="share-outline" size={22} color={Colors.background} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Vote deadline banner */}
        {plan?.voteDeadline && plan.status === 'pending' && (() => {
          const deadlineMs = plan.voteDeadline?.seconds
            ? plan.voteDeadline.seconds * 1000
            : new Date(plan.voteDeadline).getTime();
          const diff = deadlineMs - Date.now();
          if (diff <= 0 || diff > 7 * 24 * 60 * 60 * 1000) return null;
          const totalHours = Math.floor(diff / 3600000);
          const days = Math.floor(totalHours / 24);
          const hours = totalHours % 24;
          const label = days > 0 ? `${days}d ${hours}h` : `${totalHours}h`;
          return (
            <View style={styles.deadlineBanner}>
              <Ionicons name="timer-outline" size={14} color={Colors.gold} />
              <Text style={styles.deadlineText}>Vote closes in {label}</Text>
            </View>
          );
        })()}

        {/* Tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsBar}>
          {visibleTabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key as DetailTab)}
              style={[styles.detailTab, activeTab === t.key && styles.detailTabActive]}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === t.key }}
              accessibilityLabel={t.label}
            >
              <Text style={[styles.detailTabLabel, activeTab === t.key && styles.detailTabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {activeTab === 'Overview' && renderOverview()}
          {activeTab === 'Poll' && <PollTab plan={plan} uid={uid} />}
          {activeTab === 'Chat' && renderChat()}
          {activeTab === 'Moments' && renderMoments()}
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <EditPlanModal
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        plan={plan}
        uid={uid}
      />

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
      <SOSModal
        visible={showSOS}
        onClose={() => setShowSOS(false)}
        plan={plan}
        emergencyContact={emergencyContact}
      />

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason="Upgrade to Pro to save more than 2 templates."
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  loadingHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  menuBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, flex: 1, textAlign: 'center' },
  loadingBody: { paddingHorizontal: Spacing.container, paddingTop: Spacing.md, gap: Spacing.sm },
  // Not-found state
  notFoundState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  notFoundIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  notFoundTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  notFoundText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
    maxWidth: 300,
  },
  notFoundBtn: {
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  notFoundBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.background,
  },
  content: { paddingBottom: 40 },
  // Cover / float header
  coverWrapper: { position: 'relative' },
  heroCover: { width: '100%', height: 220 },
  floatHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 16, zIndex: 10,
  },
  floatBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  floatActions: { flexDirection: 'row', gap: 8 },
  // Shared utility styles (hoisted to avoid inline objects in render)
  flex1: { flex: 1 },
  dim: { opacity: 0.4 },
  mb6: { marginBottom: 6 },
  noBorderBottom: { borderBottomWidth: 0 },
  countLabel: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  iconMr4: { marginRight: 4 },
  iconMr6: { marginRight: 6 },
  iconMl6: { marginLeft: 6 },
  avatarInitial: { color: Colors.text, fontWeight: FontWeight.bold },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  participantTouchable: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  // Tabs
  tabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.container,
  },
  detailTab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  detailTabActive: {
    borderBottomColor: Colors.primary,
  },
  detailTabLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
  },
  detailTabLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  tabContent: { paddingHorizontal: Spacing.container, paddingTop: Spacing.sm },
  // Tab empty states
  tabEmptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: Spacing.xl },
  tabEmptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 6 },
  tabEmptyText: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center' },
  // Plan info
  planTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: Spacing.sm,
  },
  categoryTagRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  categoryTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryTagText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planDesc: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.sm, lineHeight: 24 },
  metaGrid: { gap: 8, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: FontSize.md, color: Colors.textSecondary },
  reactionsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  creatorActions: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  editBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border,
  },
  editBtnText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  archiveBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.goldDim, borderWidth: 1, borderColor: Colors.goldBorder,
  },
  archiveBtnText: { color: Colors.gold, fontWeight: '600', fontSize: FontSize.sm },
  deleteBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.tertiaryDim, borderWidth: 1, borderColor: Colors.tertiaryBorder,
  },
  deleteBtnText: { color: Colors.error, fontWeight: '600', fontSize: FontSize.sm },
  leaveBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  leaveBtnText: { color: Colors.textMuted, fontWeight: '600', fontSize: FontSize.sm },
  calendarBtn: {
    marginTop: 8, paddingVertical: 12, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.successDim, borderWidth: 1, borderColor: Colors.secondaryBorder,
    flexDirection: 'row', justifyContent: 'center',
  },
  calendarBtnText: { color: Colors.success, fontWeight: '700', fontSize: FontSize.sm },
  templateBtn: { marginTop: 4, borderColor: Colors.primaryBorder, backgroundColor: Colors.primaryDim },
  templateBtnText: { color: Colors.primary },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  sectionTitleTight: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  quorumHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  quorumCount: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  quorumCountDim: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
  },
  quorumSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.sm,
  },
  quorumBarWrap: { marginBottom: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  inviteToggle: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  chatCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 48 },
  chatCardIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  chatCardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 2 },
  chatCardSub: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  participantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  participantAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center',
  },
  participantName: { flex: 1, color: Colors.text, fontSize: FontSize.md },
  votedBadge: {
    backgroundColor: Colors.successDim,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Radius.md,
  },
  votedText: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '700' },
  inviteSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  inviteSectionTitle: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: 8 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 },
  inviteHandle: { color: Colors.primary, fontSize: FontSize.xs },
  inviteBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md,
    backgroundColor: Colors.primaryDim, borderWidth: 1, borderColor: Colors.primaryBorder,
  },
  inviteBtnText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  noFriendsText: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 8, textAlign: 'center' },
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
  photoEmpty: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.xs },
  photoEmptyText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
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
  commentAvatarText: { color: Colors.text, fontWeight: '700', fontSize: 12 },
  commentHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  commentAuthor: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  commentTime: { fontSize: FontSize.xs, color: Colors.textMuted },
  commentText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 20 },
  commentInputRow: { marginTop: 12, marginBottom: 0 },
  commentsEmpty: { alignItems: 'center', paddingVertical: 16 },
  commentsEmptyText: { color: Colors.textMuted, fontSize: FontSize.sm },
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
    color: Colors.background,
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
  deadlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.goldDim,
    borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8,
    marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: Colors.gold + '33',
  },
  deadlineText: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: FontWeight.semibold },
  // Stitch: Plan Detail - Social Focus
  upcomingLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 6,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  autoBadge: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  autoBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.background,
    letterSpacing: 1,
  },
  pendingBadge: {
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  detailsBox: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  detailsBoxLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailsBoxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
  },
  detailsBoxKey: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailsBoxValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  detailsBoxDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  whoIsInSection: {
    paddingHorizontal: Spacing.container,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  whoIsInLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
  },
  whoIsInScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.sm,
  },
  whoIsInAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  whoIsInAvatarOverlap: { marginLeft: AVATAR_OVERLAP },
  whoIsInAvatarMore: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.background,
  },
  whoIsInInitial: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.background,
  },
  whoIsInMoreText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
  },
  lastTimeSection: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  lastTimeLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingHorizontal: Spacing.container,
    marginBottom: 10,
  },
  lastTimeScroll: {
    paddingHorizontal: Spacing.container,
    gap: 8,
  },
  lastTimePhoto: {
    width: 120,
    height: 90,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  liveActivityLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.sm,
    paddingBottom: 8,
  },
});
