import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { isAtPlanLimit } from '../lib/subscription';
import { useSubscription } from '../hooks/useSubscription';
import { useCelebration } from '../hooks/useCelebration';
import PaywallModal from '../components/PaywallModal';
import ScreenWrapper from '../components/ScreenWrapper';
import AnimatedButton from '../components/AnimatedButton';
import ConfettiParticles, { ConfettiRef } from '../components/ConfettiParticles';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { Label, SectionHeading, PickerModal } from '../components/create-plan/FormBits';
import TemplatesModal from '../components/create-plan/TemplatesModal';
import {
  CATEGORIES,
  VOTE_OPTIONS,
  MAX_PARTICIPANT_OPTIONS,
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  COOLDOWN_DAYS,
  HIT_SLOP,
  Template,
  formatDate,
  makeInviteCode,
} from '../components/create-plan/shared';

export default function CreatePlanScreen() {
  const router = useRouter();
  const { isPro } = useSubscription();
  const confettiRef = useRef<ConfettiRef>(null);
  const { celebrate, glowStyle } = useCelebration();

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
        poll,
        voteDeadline: voteDeadline ? voteDeadline.toISOString() : null,
        maxParticipants: maxParticipants ?? null,
        inviteCode: makeInviteCode(),
        lat,
        lng,
      });
      celebrate(confettiRef);
      setTimeout(() => {
        router.push({ pathname: '/plan-detail', params: { id: planRef.id } });
      }, 750);
    } catch (e: any) {
      setError(e?.message || 'Failed to create plan');
    } finally {
      setLoading(false);
    }
  }, [
    loading,
    uid,
    isPro,
    title,
    description,
    showPoll,
    pollQuestion,
    pollOptions,
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

  const submitLabel = loading ? 'Creating...' : 'Create Plan';

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
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
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Use a template, ${templates.length} available`}
            >
              <Ionicons name="bookmark-outline" size={16} color={Colors.primary} style={styles.mr6} />
              <Text style={styles.templateBtnText}>Use a Template ({templates.length})</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={styles.mlAuto} />
            </TouchableOpacity>
          )}

          <SectionHeading text="Basics" first />

          <Label text="Plan Title *" first />
          <TextInput
            style={styles.input}
            placeholder="e.g. Weekend Getaway"
            placeholderTextColor={Colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            returnKeyType="next"
          />
          <View style={styles.fieldFooterRow}>
            <Text style={styles.helperText}>Keep it short and memorable.</Text>
            <Text style={styles.charCount}>{title.length}/80</Text>
          </View>

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
          <View style={styles.fieldFooterRow}>
            <View style={styles.flex} />
            <Text style={styles.charCount}>{description.length}/500</Text>
          </View>

          <Label text="Location" />
          <View style={styles.input}>
            <View style={styles.timeRow}>
              <Ionicons name="location-outline" size={16} color={Colors.textMuted} style={styles.mr8} />
              <TextInput
                style={[styles.flex, styles.embeddedInput]}
                placeholder="Where is it happening?"
                placeholderTextColor={Colors.textMuted}
                value={location}
                onChangeText={setLocation}
                maxLength={150}
              />
            </View>
          </View>
          <Text style={styles.helperText}>Used to show distance in Discover.</Text>

          <SectionHeading text="When" />

          <Label text="Date" />
          <TouchableOpacity
            style={[styles.input, styles.timeRow]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={formattedDate ? `Date: ${formattedDate}` : 'Pick a date'}
          >
            <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} style={styles.mr8} />
            <Text style={formattedDate ? styles.valueText : styles.placeholderText}>
              {formattedDate || 'Pick a date'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={styles.mlAuto} />
          </TouchableOpacity>
          {date && (
            <TouchableOpacity onPress={() => setDate(null)} hitSlop={HIT_SLOP} activeOpacity={0.7} style={styles.inlineAction}>
              <Ionicons name="close" size={14} color={Colors.textMuted} style={styles.mr4} />
              <Text style={styles.inlineActionText}>Clear date</Text>
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
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Time: ${formattedTime}`}
          >
            <Ionicons name="time-outline" size={16} color={Colors.textMuted} style={styles.mr8} />
            <Text style={styles.valueText}>{formattedTime}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={styles.mlAuto} />
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
            style={[styles.input, styles.timeRow]}
            onPress={() => setShowVoteDeadlinePicker(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={formattedVoteDeadline ? `Vote deadline: ${formattedVoteDeadline}` : 'Pick a vote deadline'}
          >
            <Ionicons name="hourglass-outline" size={16} color={Colors.textMuted} style={styles.mr8} />
            <Text style={formattedVoteDeadline ? styles.valueText : styles.placeholderText}>
              {formattedVoteDeadline || 'Pick a deadline'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={styles.mlAuto} />
          </TouchableOpacity>
          <Text style={styles.helperText}>The vote closes automatically at this date.</Text>
          {voteDeadline && (
            <TouchableOpacity onPress={() => setVoteDeadline(null)} hitSlop={HIT_SLOP} activeOpacity={0.7} style={styles.inlineAction}>
              <Ionicons name="close" size={14} color={Colors.textMuted} style={styles.mr4} />
              <Text style={styles.inlineActionText}>Clear deadline</Text>
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

          <SectionHeading text="Details" />

          <Label text="Category" />
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => {
              const active = category === c && !usingCustomCategory;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setUsingCustomCategory(false);
                    setCategory(category === c ? '' : c);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  {active && <Ionicons name="checkmark" size={14} color={Colors.background} style={styles.mr4} />}
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.categoryChip, usingCustomCategory && styles.categoryChipActive]}
              activeOpacity={0.7}
              onPress={() => {
                setUsingCustomCategory(true);
                setCategory('');
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: usingCustomCategory }}
            >
              {usingCustomCategory && <Ionicons name="checkmark" size={14} color={Colors.background} style={styles.mr4} />}
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

          <SectionHeading text="Quorum & Access" />

          <Label text="Required Votes (Quorum)" />
          <View style={styles.voteRow}>
            {VOTE_OPTIONS.map((n) => {
              const active = requiredVotes === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.voteChip, active && styles.voteChipActive]}
                  activeOpacity={0.7}
                  onPress={() => setRequiredVotes(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.voteChipText, active && styles.voteChipTextActive]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.helperText}>The plan confirms once this many people vote yes.</Text>

          <Label text="Max Participants (optional)" />
          <View style={styles.voteRowWrap}>
            {MAX_PARTICIPANT_OPTIONS.map((opt) => {
              const active = maxParticipants === opt.value;
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[styles.voteChip, active && styles.voteChipActive]}
                  activeOpacity={0.7}
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
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: !isPublic }}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={16}
                  color={!isPublic ? Colors.primary : Colors.textMuted}
                  style={styles.mr6}
                />
                <Text style={[styles.toggleText, !isPublic && styles.toggleTextActive]}>Private</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, isPublic && styles.toggleBtnActive]}
                onPress={() => setIsPublic(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: isPublic }}
              >
                <Ionicons
                  name="globe-outline"
                  size={16}
                  color={isPublic ? Colors.primary : Colors.textMuted}
                  style={styles.mr6}
                />
                <Text style={[styles.toggleText, isPublic && styles.toggleTextActive]}>Public</Text>
              </TouchableOpacity>
            </View>
          )}
          {!inCooldown && (
            <Text style={styles.helperText}>
              {isPublic ? 'Anyone can discover and join this plan.' : 'Only people with the invite link can join.'}
            </Text>
          )}

          <SectionHeading text="Poll (optional)" />

          <TouchableOpacity
            style={styles.pollToggleBtn}
            onPress={togglePoll}
            activeOpacity={0.7}
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
              {pollSubmitted && !pollQuestion.trim() && (
                <Text style={styles.fieldError}>A question is required.</Text>
              )}

              <Text style={styles.pollSectionLabel}>Options</Text>
              {pollOptions.map((opt, i) => {
                const invalid = pollSubmitted && !opt.trim();
                return (
                  <View key={i} style={styles.pollOptionRow}>
                    <View style={styles.optionIndex}>
                      <Text style={styles.optionIndexText}>{i + 1}</Text>
                    </View>
                    <TextInput
                      style={[styles.input, styles.flex, invalid && styles.inputError]}
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
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove option ${i + 1}`}
                      >
                        <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              {pollSubmitted && pollOptions.filter((o) => o.trim()).length < MIN_POLL_OPTIONS && (
                <Text style={styles.fieldError}>Add at least {MIN_POLL_OPTIONS} options.</Text>
              )}
              {pollOptions.length < MAX_POLL_OPTIONS && (
                <TouchableOpacity
                  style={styles.addOptionBtn}
                  onPress={addPollOption}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add poll option"
                >
                  <Ionicons name="add-circle-outline" size={16} color={Colors.primary} style={styles.mr6} />
                  <Text style={styles.addOptionText}>Add option</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.error} style={styles.mr8} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <Animated.View style={glowStyle}>
            <AnimatedButton
              label={submitLabel}
              onPress={handleCreate}
              variant="primary"
              disabled={loading}
              loading={loading}
              style={styles.submitBtn}
              textStyle={styles.submitText}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <TemplatesModal
        visible={showTemplates}
        templates={templates}
        onClose={() => setShowTemplates(false)}
        onApply={applyTemplate}
        onDelete={deleteTemplate}
      />

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason="You've reached your 3-plan limit on the free tier."
      />

      <ConfettiParticles ref={confettiRef} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mr4: { marginRight: 4 },
  mr6: { marginRight: 6 },
  mr8: { marginRight: 8 },
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
  form: { paddingHorizontal: Spacing.container, paddingTop: Spacing.sm, gap: Spacing.xs, paddingBottom: Spacing.xxl },
  input: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: 14,
    minHeight: 50,
    color: Colors.text,
    fontSize: FontSize.md,
    justifyContent: 'center',
  },
  embeddedInput: { paddingVertical: 0, color: Colors.text, fontSize: FontSize.md },
  valueText: { color: Colors.text, fontSize: FontSize.md },
  placeholderText: { color: Colors.textMuted, fontSize: FontSize.md },
  multiline: { minHeight: 96, paddingVertical: 12, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  fieldFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs },
  helperText: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, marginTop: Spacing.xs },
  fieldError: { fontSize: FontSize.xs, color: Colors.error, fontWeight: FontWeight.semibold, marginTop: Spacing.xs },
  inlineAction: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 6, marginTop: 2 },
  inlineActionText: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  charCount: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'right', fontVariant: ['tabular-nums'] },
  pickerSpinner: { backgroundColor: Colors.surfaceRaised },
  categoryRow: { flexDirection: 'row', gap: Spacing.xs * 2, flexWrap: 'wrap' },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
  },
  categoryChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryChipText: { color: Colors.textSecondary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  categoryChipTextActive: { color: Colors.background },
  voteRow: { flexDirection: 'row', gap: Spacing.xs * 2 },
  voteRowWrap: { flexDirection: 'row', gap: Spacing.xs * 2, flexWrap: 'wrap' },
  voteChip: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: Spacing.gutter,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
  },
  voteChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  voteChipText: { color: Colors.textSecondary, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  voteChipTextActive: { color: Colors.background },
  toggleRow: { flexDirection: 'row', gap: Spacing.sm },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 48,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
  },
  toggleBtnActive: { backgroundColor: Colors.primaryDim, borderColor: Colors.primary },
  toggleText: { color: Colors.textSecondary, fontWeight: FontWeight.semibold, fontSize: FontSize.md },
  toggleTextActive: { color: Colors.primary, fontWeight: FontWeight.bold },
  pollToggleBtn: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollToggleInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs + 2 },
  pollToggleText: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  pollSection: {
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pollSectionLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.heavy,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs * 2 },
  optionIndex: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIndexText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  removeOptionBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addOptionBtn: { minHeight: 44, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.errorDim,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    marginTop: Spacing.sm,
  },
  error: { flex: 1, color: Colors.error, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, lineHeight: 18 },
  inputError: { borderColor: Colors.borderStrong, borderWidth: 1.5 },
  submitBtn: { marginTop: Spacing.md, paddingVertical: 16 },
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
});
