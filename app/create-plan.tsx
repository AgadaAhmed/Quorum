import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { isAtPlanLimit } from '../lib/subscription';
import { useSubscription } from '../hooks/useSubscription';
import PaywallModal from '../components/PaywallModal';
import ScreenWrapper from '../components/ScreenWrapper';
import AnimatedButton from '../components/AnimatedButton';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

const CATEGORIES = ['Music', 'Food', 'Sports', 'Art', 'Gaming', 'Travel', 'Party', 'Study'] as const;
const VOTE_OPTIONS = ['2', '3', '5', '7', '10'] as const;
const MAX_PARTICIPANT_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'No Limit', value: null },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '15', value: 15 },
  { label: '20', value: 20 },
  { label: '30', value: 30 },
  { label: '50', value: 50 },
];
const MAX_POLL_OPTIONS = 4;
const MIN_POLL_OPTIONS = 2;
const COOLDOWN_DAYS = 7;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DATE_FMT: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };

type Template = {
  id: string;
  name?: string;
  description?: string;
  location?: string;
  category?: string;
  requiredVotes?: number;
  isPublic?: boolean;
  maxParticipants?: number | null;
};

function formatDate(d: Date | null): string | null {
  return d ? d.toLocaleDateString('en-US', DATE_FMT) : null;
}

function makeInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}

export default function CreatePlanScreen() {
  const router = useRouter();
  const { isPro } = useSubscription();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [time, setTime] = useState<Date>(() => new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [requiredVotes, setRequiredVotes] = useState('3');
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usingCustomCategory, setUsingCustomCategory] = useState(false);
  const [voteDeadline, setVoteDeadline] = useState<Date | null>(null);
  const [showVoteDeadlinePicker, setShowVoteDeadlinePicker] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState<number | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [pollSubmitted, setPollSubmitted] = useState(false);
  const [accountAgeDays, setAccountAgeDays] = useState<number | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const [uid, setUid] = useState(auth.currentUser?.uid || '');

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || '')), []);

  // Single user-doc read covers both templates and account age (was two reads).
  useEffect(() => {
    if (!uid) return;
    let active = true;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (!active) return;
        const data = snap.data();
        setTemplates(Array.isArray(data?.templates) ? data.templates : []);
        const createdAt = data?.createdAt?.toDate?.();
        if (createdAt instanceof Date) {
          const days = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
          setAccountAgeDays(days);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!auth.currentUser) router.replace('/(auth)/login');
  }, [router]);

  const applyTemplate = useCallback((t: Template) => {
    setTitle(t.name || '');
    setDescription(t.description || '');
    setLocation(t.location || '');
    if (t.category) {
      setCategory(t.category);
      setUsingCustomCategory(!(CATEGORIES as readonly string[]).includes(t.category));
    } else {
      setCategory('');
      setUsingCustomCategory(false);
    }
    setRequiredVotes(String(t.requiredVotes || 3));
    setIsPublic(t.isPublic ?? false);
    setMaxParticipants(t.maxParticipants ?? null);
    setShowTemplates(false);
  }, []);

  const deleteTemplate = useCallback(
    async (templateId: string) => {
      if (!uid) return;
      const userRef = doc(db, 'users', uid);
      try {
        const snap = await getDoc(userRef);
        const current: Template[] = Array.isArray(snap.data()?.templates) ? snap.data()!.templates : [];
        await updateDoc(userRef, { templates: current.filter((t) => t.id !== templateId) });
        setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      } catch (e: any) {
        setError(e?.message || 'Failed to delete template');
      }
    },
    [uid]
  );

  const handlePickCover = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Photo library permission is required to add a cover.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images' as ImagePicker.MediaType],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]) {
        setCoverUri(result.assets[0].uri);
      }
    } catch {
      setError('Could not open the photo library.');
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (loading) return;
    setError('');

    if (!uid) {
      setError('You must be signed in to create a plan');
      return;
    }

    if (!isPro) {
      try {
        const q = query(
          collection(db, 'plans'),
          where('createdBy', '==', uid),
          where('status', 'in', ['pending', 'confirmed'])
        );
        const snap = await getDocs(q);
        if (isAtPlanLimit(snap.size, 'free')) {
          setShowPaywall(true);
          return;
        }
      } catch (e: any) {
        setError(e?.message || 'Could not verify your plan limit. Try again.');
        return;
      }
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required');
      return;
    }
    if (showPoll) {
      setPollSubmitted(true);
      if (!pollQuestion.trim()) {
        setError('Poll question is required');
        return;
      }
      if (pollOptions.filter((o) => o.trim()).length < MIN_POLL_OPTIONS) {
        setError(`Add at least ${MIN_POLL_OPTIONS} poll options`);
        return;
      }
    }

    setLoading(true);
    try {
      const planRef = doc(collection(db, 'plans'));

      let coverUrl: string | null = null;
      if (coverUri) {
        setUploadingCover(true);
        try {
          const response = await fetch(coverUri);
          const blob = await response.blob();
          const storageRef = ref(storage, `plan-covers/${planRef.id}`);
          await uploadBytes(storageRef, blob);
          coverUrl = await getDownloadURL(storageRef);
        } catch {
          // Cover upload failed — create plan without it.
        } finally {
          setUploadingCover(false);
        }
      }

      // Geocode location to lat/lng so Discover can show distance.
      let lat: number | null = null;
      let lng: number | null = null;
      const trimmedLocation = location.trim();
      if (trimmedLocation) {
        try {
          const results = await Location.geocodeAsync(trimmedLocation);
          if (results.length > 0) {
            lat = results[0].latitude;
            lng = results[0].longitude;
          }
        } catch {}
      }

      const poll =
        showPoll && pollQuestion.trim()
          ? {
              question: pollQuestion.trim(),
              options: pollOptions.filter((o) => o.trim()),
              votes: {},
            }
          : null;

      const dateTimestamp = date
        ? new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            time.getHours(),
            time.getMinutes()
          ).toISOString()
        : null;

      await setDoc(planRef, {
        title: trimmedTitle.slice(0, 80),
        description: description.trim().slice(0, 500),
        location: trimmedLocation.slice(0, 150),
        date: formatDate(date) || '',
        dateTimestamp,
        category: category.trim() || null,
        requiredVotes: parseInt(requiredVotes, 10) || 3,
        votes: [uid],
        participants: [uid],
        createdBy: uid,
        isPublic,
        status: 'pending',
        createdAt: serverTimestamp(),
        coverUrl,
        poll,
        voteDeadline: voteDeadline ? voteDeadline.toISOString() : null,
        maxParticipants: maxParticipants ?? null,
        inviteCode: makeInviteCode(),
        lat,
        lng,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.push({ pathname: '/plan-detail', params: { id: planRef.id } });
    } catch (e: any) {
      setError(e?.message || 'Failed to create plan');
    } finally {
      setLoading(false);
      setUploadingCover(false);
    }
  }, [
    loading,
    uid,
    isPro,
    title,
    showPoll,
    pollQuestion,
    pollOptions,
    coverUri,
    location,
    date,
    time,
    category,
    requiredVotes,
    isPublic,
    voteDeadline,
    maxParticipants,
    router,
  ]);

  const togglePoll = useCallback(() => {
    setShowPoll((prev) => {
      if (prev) setPollSubmitted(false);
      return !prev;
    });
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const setPollOption = useCallback((index: number, value: string) => {
    setPollOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const removePollOption = useCallback((index: number) => {
    setPollOptions((prev) => prev.filter((_, j) => j !== index));
  }, []);

  const addPollOption = useCallback(() => {
    setPollOptions((prev) => (prev.length < MAX_POLL_OPTIONS ? [...prev, ''] : prev));
  }, []);

  const formattedDate = useMemo(() => formatDate(date), [date]);
  const formattedVoteDeadline = useMemo(() => formatDate(voteDeadline), [voteDeadline]);
  const formattedTime = useMemo(
    () => time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    [time]
  );

  const inCooldown = accountAgeDays !== null && accountAgeDays < COOLDOWN_DAYS;
  const cooldownDaysLeft = accountAgeDays !== null ? COOLDOWN_DAYS - accountAgeDays : 0;

  const submitLabel = uploadingCover ? 'Uploading photo...' : loading ? 'Creating...' : 'Create Plan';

  const renderTemplate = useCallback(
    ({ item }: { item: Template }) => (
      <TemplateRow item={item} onApply={applyTemplate} onDelete={deleteTemplate} />
    ),
    [applyTemplate, deleteTemplate]
  );

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={HIT_SLOP}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>NEW PLAN</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {templates.length > 0 && (
            <TouchableOpacity
              style={styles.templateBtn}
              onPress={() => setShowTemplates(true)}
              accessibilityRole="button"
              accessibilityLabel={`Use a template, ${templates.length} available`}
            >
              <Ionicons name="bookmark-outline" size={16} color={Colors.primary} style={styles.mr6} />
              <Text style={styles.templateBtnText}>Use a Template ({templates.length})</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={styles.mlAuto} />
            </TouchableOpacity>
          )}

          <Label text="Cover Photo (optional)" first />
          <TouchableOpacity
            style={styles.coverPicker}
            onPress={handlePickCover}
            accessibilityRole="button"
            accessibilityLabel={coverUri ? 'Change cover photo' : 'Add cover photo'}
          >
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverPreview} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="image-outline" size={28} color={Colors.textMuted} style={styles.mb6} />
                <Text style={styles.coverPlaceholderText}>ADD COVER PHOTO</Text>
              </View>
            )}
          </TouchableOpacity>
          {coverUri && (
            <TouchableOpacity onPress={() => setCoverUri(null)} hitSlop={HIT_SLOP}>
              <Text style={styles.clearDate}>Remove cover photo</Text>
            </TouchableOpacity>
          )}

          <Label text="Plan Title *" />
          <TextInput
            style={styles.input}
            placeholder="e.g. Weekend Getaway"
            placeholderTextColor={Colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            returnKeyType="next"
          />
          <Text style={styles.charCount}>{title.length}/80</Text>

          <Label text="Description" />
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="What's the plan about?"
            placeholderTextColor={Colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={500}
          />

          <Label text="Location" />
          <TextInput
            style={styles.input}
            placeholder="Where is it happening?"
            placeholderTextColor={Colors.textMuted}
            value={location}
            onChangeText={setLocation}
            maxLength={150}
          />

          <Label text="Date" />
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={formattedDate ? `Date: ${formattedDate}` : 'Pick a date'}
          >
            <Text style={formattedDate ? styles.valueText : styles.placeholderText}>
              {formattedDate || 'Pick a date'}
            </Text>
          </TouchableOpacity>
          {date && (
            <TouchableOpacity onPress={() => setDate(null)} hitSlop={HIT_SLOP}>
              <Text style={styles.clearDate}>Clear date</Text>
            </TouchableOpacity>
          )}

          {Platform.OS === 'android' && showDatePicker && (
            <DateTimePicker
              value={date || new Date()}
              mode="date"
              minimumDate={new Date()}
              onChange={(_, selected) => {
                setShowDatePicker(false);
                if (selected) setDate(selected);
              }}
            />
          )}
          {Platform.OS === 'ios' && showDatePicker && (
            <PickerModal visible onCancel={() => setShowDatePicker(false)} onDone={() => setShowDatePicker(false)}>
              <DateTimePicker
                value={date || new Date()}
                mode="date"
                minimumDate={new Date()}
                display="spinner"
                onChange={(_, selected) => {
                  if (selected) setDate(selected);
                }}
                style={styles.pickerSpinner}
              />
            </PickerModal>
          )}

          <Label text="Time" />
          <TouchableOpacity
            style={[styles.input, styles.timeRow]}
            onPress={() => setShowTimePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Time: ${formattedTime}`}
          >
            <Ionicons name="time-outline" size={16} color={Colors.textMuted} style={styles.mr8} />
            <Text style={styles.valueText}>{formattedTime}</Text>
          </TouchableOpacity>

          {Platform.OS === 'android' && showTimePicker && (
            <DateTimePicker
              value={time}
              mode="time"
              is24Hour={false}
              onChange={(_, selected) => {
                setShowTimePicker(false);
                if (selected) setTime(selected);
              }}
            />
          )}
          {Platform.OS === 'ios' && showTimePicker && (
            <PickerModal visible onCancel={() => setShowTimePicker(false)} onDone={() => setShowTimePicker(false)}>
              <DateTimePicker
                value={time}
                mode="time"
                display="spinner"
                onChange={(_, selected) => {
                  if (selected) setTime(selected);
                }}
                style={styles.pickerSpinner}
              />
            </PickerModal>
          )}

          <Label text="Vote Deadline (optional)" />
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowVoteDeadlinePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={formattedVoteDeadline ? `Vote deadline: ${formattedVoteDeadline}` : 'Pick a vote deadline'}
          >
            <Text style={formattedVoteDeadline ? styles.valueText : styles.placeholderText}>
              {formattedVoteDeadline || 'Pick a deadline (optional)'}
            </Text>
          </TouchableOpacity>
          {voteDeadline && (
            <TouchableOpacity onPress={() => setVoteDeadline(null)} hitSlop={HIT_SLOP}>
              <Text style={styles.clearDate}>Clear deadline</Text>
            </TouchableOpacity>
          )}

          {Platform.OS === 'android' && showVoteDeadlinePicker && (
            <DateTimePicker
              value={voteDeadline || new Date()}
              mode="date"
              minimumDate={new Date()}
              onChange={(_, selected) => {
                setShowVoteDeadlinePicker(false);
                if (selected) setVoteDeadline(selected);
              }}
            />
          )}
          {Platform.OS === 'ios' && showVoteDeadlinePicker && (
            <PickerModal
              visible
              onCancel={() => setShowVoteDeadlinePicker(false)}
              onDone={() => setShowVoteDeadlinePicker(false)}
            >
              <DateTimePicker
                value={voteDeadline || new Date()}
                mode="date"
                minimumDate={new Date()}
                display="spinner"
                onChange={(_, selected) => {
                  if (selected) setVoteDeadline(selected);
                }}
                style={styles.pickerSpinner}
              />
            </PickerModal>
          )}

          <Label text="Category" />
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => {
              const active = category === c && !usingCustomCategory;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => {
                    setUsingCustomCategory(false);
                    setCategory(category === c ? '' : c);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.categoryChip, usingCustomCategory && styles.categoryChipActive]}
              onPress={() => {
                setUsingCustomCategory(true);
                setCategory('');
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: usingCustomCategory }}
            >
              <Text style={[styles.categoryChipText, usingCustomCategory && styles.categoryChipTextActive]}>
                Custom
              </Text>
            </TouchableOpacity>
          </View>
          {usingCustomCategory && (
            <TextInput
              style={styles.input}
              placeholder="e.g. Hiking, Coding, Book Club..."
              placeholderTextColor={Colors.textMuted}
              value={category}
              onChangeText={setCategory}
              autoFocus
              maxLength={30}
            />
          )}

          <Label text="Required Votes (Quorum)" />
          <View style={styles.voteRow}>
            {VOTE_OPTIONS.map((n) => {
              const active = requiredVotes === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.voteChip, active && styles.voteChipActive]}
                  onPress={() => setRequiredVotes(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.voteChipText, active && styles.voteChipTextActive]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Label text="Max Participants (optional)" />
          <View style={styles.voteRowWrap}>
            {MAX_PARTICIPANT_OPTIONS.map((opt) => {
              const active = maxParticipants === opt.value;
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[styles.voteChip, active && styles.voteChipActive]}
                  onPress={() => setMaxParticipants(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.voteChipText, active && styles.voteChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Label text="Visibility" />
          {inCooldown ? (
            <View style={styles.cooldownBanner}>
              <Ionicons name="time-outline" size={18} color={Colors.gold} style={styles.mr8} />
              <View style={styles.flex}>
                <Text style={styles.cooldownTitle}>New Account Cooldown</Text>
                <Text style={styles.cooldownText}>
                  Public events unlock in {cooldownDaysLeft} day{cooldownDaysLeft !== 1 ? 's' : ''}. This helps keep
                  the community safe.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, !isPublic && styles.toggleBtnActive]}
                onPress={() => setIsPublic(false)}
                accessibilityRole="button"
                accessibilityState={{ selected: !isPublic }}
              >
                <Text style={[styles.toggleText, !isPublic && styles.toggleTextActive]}>Private</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, isPublic && styles.toggleBtnActive]}
                onPress={() => setIsPublic(true)}
                accessibilityRole="button"
                accessibilityState={{ selected: isPublic }}
              >
                <Text style={[styles.toggleText, isPublic && styles.toggleTextActive]}>Public</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.pollToggleBtn}
            onPress={togglePoll}
            accessibilityRole="button"
            accessibilityLabel={showPoll ? 'Remove poll' : 'Add a poll'}
          >
            <View style={styles.pollToggleInner}>
              <Ionicons
                name={showPoll ? 'remove-circle-outline' : 'add-circle-outline'}
                size={18}
                color={Colors.primary}
              />
              <Text style={styles.pollToggleText}>{showPoll ? 'Remove Poll' : 'Add a Poll'}</Text>
            </View>
          </TouchableOpacity>

          {showPoll && (
            <View style={styles.pollSection}>
              <Text style={styles.pollSectionLabel}>Poll Question</Text>
              <TextInput
                style={[styles.input, pollSubmitted && !pollQuestion.trim() && styles.inputError]}
                placeholder="e.g. Which restaurant should we go to?"
                placeholderTextColor={Colors.textMuted}
                value={pollQuestion}
                onChangeText={setPollQuestion}
                maxLength={200}
              />
              <Text style={styles.pollSectionLabel}>Options</Text>
              {pollOptions.map((opt, i) => (
                <View key={i} style={styles.pollOptionRow}>
                  <TextInput
                    style={[styles.input, styles.flex, pollSubmitted && !opt.trim() && styles.inputError]}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor={Colors.textMuted}
                    value={opt}
                    onChangeText={(t) => setPollOption(i, t)}
                    maxLength={100}
                  />
                  {pollOptions.length > MIN_POLL_OPTIONS && (
                    <TouchableOpacity
                      style={styles.removeOptionBtn}
                      onPress={() => removePollOption(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove option ${i + 1}`}
                    >
                      <Ionicons name="close-circle" size={22} color={Colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {pollOptions.length < MAX_POLL_OPTIONS && (
                <TouchableOpacity
                  style={styles.addOptionBtn}
                  onPress={addPollOption}
                  accessibilityRole="button"
                  accessibilityLabel="Add poll option"
                >
                  <Ionicons name="add-circle-outline" size={15} color={Colors.primary} style={styles.mr4} />
                  <Text style={styles.addOptionText}>Add option</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AnimatedButton
            label={submitLabel}
            onPress={handleCreate}
            variant="primary"
            disabled={loading}
            loading={loading}
            style={styles.submitBtn}
            textStyle={styles.submitText}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showTemplates} transparent animationType="slide" onRequestClose={() => setShowTemplates(false)}>
        <View style={styles.templateModalOverlay}>
          <View style={styles.templateModalContent}>
            <View style={styles.templateModalHeader}>
              <Text style={styles.templateModalTitle}>My Templates</Text>
              <TouchableOpacity
                onPress={() => setShowTemplates(false)}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Close templates"
              >
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {templates.length === 0 ? (
              <Text style={styles.templateEmpty}>You have no saved templates yet.</Text>
            ) : (
              <FlatList
                data={templates}
                keyExtractor={(t) => t.id}
                contentContainerStyle={styles.templateList}
                renderItem={renderTemplate}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </View>
      </Modal>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason="You've reached your 3-plan limit on the free tier."
      />
    </ScreenWrapper>
  );
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const Label = React.memo(function Label({ text, first }: { text: string; first?: boolean }) {
  return <Text style={[styles.label, first && styles.labelFirst]}>{text}</Text>;
});

const PickerModal = React.memo(function PickerModal({
  visible,
  onCancel,
  onDone,
  children,
}: {
  visible: boolean;
  onCancel: () => void;
  onDone: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.dateModalOverlay}>
        <View style={styles.dateModalContent}>
          <View style={styles.dateModalHeader}>
            <TouchableOpacity onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.dateModalCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDone} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={styles.dateModalDone}>Done</Text>
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
});

const TemplateRow = React.memo(function TemplateRow({
  item,
  onApply,
  onDelete,
}: {
  item: Template;
  onApply: (t: Template) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.templateItem}
      onPress={() => onApply(item)}
      accessibilityRole="button"
      accessibilityLabel={`Use template ${item.name || 'Untitled'}`}
    >
      <View style={styles.flex}>
        <Text style={styles.templateItemTitle}>{item.name || 'Untitled'}</Text>
        {item.description ? (
          <Text style={styles.templateItemDesc} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.templateTagRow}>
          {item.category ? <Text style={styles.templateTag}>{item.category}</Text> : null}
          <Text style={styles.templateTag}>{item.requiredVotes ?? 3} votes</Text>
          {item.isPublic ? <Text style={styles.templateTag}>Public</Text> : null}
        </View>
      </View>
      <TouchableOpacity
        onPress={() => onDelete(item.id)}
        hitSlop={HIT_SLOP}
        style={styles.templateDeleteBtn}
        accessibilityRole="button"
        accessibilityLabel={`Delete template ${item.name || 'Untitled'}`}
      >
        <Ionicons name="trash-outline" size={16} color={Colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mr4: { marginRight: 4 },
  mr6: { marginRight: 6 },
  mr8: { marginRight: 8 },
  mb6: { marginBottom: 6 },
  mlAuto: { marginLeft: 'auto' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  headerSpacer: { width: 44 },
  title: { flex: 1, textAlign: 'center', fontSize: FontSize.md, fontWeight: FontWeight.black, color: Colors.text, letterSpacing: 3 },
  form: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },
  label: {
    fontSize: 11,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: Spacing.md,
  },
  labelFirst: { marginTop: 0 },
  input: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: FontSize.md,
    justifyContent: 'center',
  },
  valueText: { color: Colors.text, fontSize: FontSize.md },
  placeholderText: { color: Colors.textMuted, fontSize: FontSize.md },
  multiline: { height: 90, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  clearDate: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: -4, paddingVertical: 4 },
  charCount: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'right', marginTop: -4 },
  coverPicker: { borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.border },
  coverPreview: { width: '100%', height: 160 },
  coverPlaceholder: { height: 160, backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  coverPlaceholderText: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.5 },
  dateModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  dateModalContent: {
    backgroundColor: Colors.surfaceRaised,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: 30,
  },
  dateModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dateModalCancel: { color: Colors.textSecondary, fontSize: FontSize.md, paddingVertical: 4 },
  dateModalDone: { color: Colors.primary, fontSize: FontSize.md, fontWeight: FontWeight.bold, paddingVertical: 4 },
  pickerSpinner: { backgroundColor: Colors.surfaceRaised },
  categoryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  categoryChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryChipText: { color: Colors.textSecondary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  categoryChipTextActive: { color: Colors.background },
  voteRow: { flexDirection: 'row', gap: 8 },
  voteRowWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  voteChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  voteChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  voteChipText: { color: Colors.textSecondary, fontWeight: FontWeight.bold },
  voteChipTextActive: { color: Colors.background },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleBtnActive: { backgroundColor: Colors.primaryDim, borderColor: Colors.primary },
  toggleText: { color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  toggleTextActive: { color: Colors.primary },
  pollToggleBtn: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  pollToggleInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pollToggleText: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  pollSection: {
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pollSectionLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeOptionBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addOptionBtn: { paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  addOptionText: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  cooldownBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.goldDim,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    padding: Spacing.md,
  },
  cooldownTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gold, marginBottom: 2 },
  cooldownText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  error: { color: Colors.error, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  inputError: { borderColor: Colors.error, borderWidth: 1.5 },
  submitBtn: { marginTop: 8, paddingVertical: 16 },
  submitText: { fontWeight: FontWeight.heavy, letterSpacing: 1 },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryDim,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  templateBtnText: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  templateModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  templateModalContent: {
    backgroundColor: Colors.surfaceRaised,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '70%',
  },
  templateModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  templateModalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.text },
  templateEmpty: { fontSize: FontSize.sm, color: Colors.textMuted, paddingVertical: Spacing.md },
  templateList: { gap: 8, paddingBottom: Spacing.md },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  templateItemTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  templateItemDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  templateTagRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  templateTag: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    backgroundColor: Colors.primaryDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  templateDeleteBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
});
