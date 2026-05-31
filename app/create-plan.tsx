import React, { useEffect, useState } from 'react';
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
import { isAtPlanLimit, isAtTemplatesLimit } from '../lib/subscription';
import { useSubscription } from '../hooks/useSubscription';
import PaywallModal from '../components/PaywallModal';
import ScreenWrapper from '../components/ScreenWrapper';
import AnimatedButton from '../components/AnimatedButton';
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

const CATEGORIES = ['Music', 'Food', 'Sports', 'Art', 'Gaming', 'Travel', 'Party', 'Study'];

const CATEGORY_EMOJI: Record<string, string> = {};

export default function CreatePlanScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [time, setTime] = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [requiredVotes, setRequiredVotes] = useState('3');
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usingCustomCategory, setUsingCustomCategory] = useState(false);
  const [voteDeadline, setVoteDeadline] = useState<Date | null>(null);
  const [showVoteDeadlinePicker, setShowVoteDeadlinePicker] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState<number | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [pollSubmitted, setPollSubmitted] = useState(false);
  const [accountAgeDays, setAccountAgeDays] = useState<number | null>(null);
  const COOLDOWN_DAYS = 7;
  const [showPaywall, setShowPaywall] = useState(false);

  const [uid, setUid] = useState(auth.currentUser?.uid || '');
  const { isPro } = useSubscription();

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid || ''));
  }, []);

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      setTemplates(snap.data()?.templates || []);
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      const createdAt = snap.data()?.createdAt?.toDate?.();
      if (createdAt) {
        const days = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        setAccountAgeDays(days);
      }
    });
  }, [uid]);

  useEffect(() => {
    if (!auth.currentUser) router.replace('/(auth)/login');
  }, []);

  const applyTemplate = (t: any) => {
    setTitle(t.name || '');
    setDescription(t.description || '');
    setLocation(t.location || '');
    if (t.category && CATEGORIES.includes(t.category)) {
      setCategory(t.category);
      setUsingCustomCategory(false);
    } else if (t.category) {
      setCategory(t.category);
      setUsingCustomCategory(true);
    }
    setRequiredVotes(String(t.requiredVotes || 3));
    setIsPublic(t.isPublic ?? false);
    setMaxParticipants(t.maxParticipants || null);
    setShowTemplates(false);
  };

  const deleteTemplate = async (templateId: string) => {
    if (!uid) return;
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const current: any[] = snap.data()?.templates || [];
    await updateDoc(userRef, { templates: current.filter((t) => t.id !== templateId) });
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
  };

  const handlePickCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images' as ImagePicker.MediaType],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const handleCreate = async () => {
    if (!isPro) {
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
    }
    if (!title.trim()) { setError('Title is required'); return; }
    if (showPoll && !pollQuestion.trim()) { setError('Poll question is required'); return; }
    if (showPoll) {
      setPollSubmitted(true);
      if (pollOptions.filter((o) => o.trim()).length < 2) { setError('Add at least 2 poll options'); return; }
    }
    setError('');
    if (!uid) { setError('You must be signed in to create a plan'); return; }
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
          // Cover upload failed — create plan without it
        } finally {
          setUploadingCover(false);
        }
      }

      // Geocode location to lat/lng so Discover can show distance
      let lat: number | null = null;
      let lng: number | null = null;
      if (location.trim()) {
        try {
          const results = await Location.geocodeAsync(location.trim());
          if (results.length > 0) {
            lat = results[0].latitude;
            lng = results[0].longitude;
          }
        } catch {}
      }

      const poll = showPoll && pollQuestion.trim()
        ? {
            question: pollQuestion.trim(),
            options: pollOptions.filter((o) => o.trim()),
            votes: {},
          }
        : null;

      const inviteCode = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

      await setDoc(planRef, {
        title: title.trim().slice(0, 80),
        description: description.trim().slice(0, 500),
        location: location.trim().slice(0, 150),
        date: date ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '',
        dateTimestamp: date
          ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes()).toISOString()
          : null,
        category: category || null,
        requiredVotes: parseInt(requiredVotes) || 3,
        votes: [uid],
        participants: [uid],
        createdBy: uid,
        isPublic,
        status: 'pending',
        createdAt: serverTimestamp(),
        coverUrl,
        poll,
        voteDeadline: voteDeadline ? voteDeadline.toISOString() : null,
        maxParticipants: maxParticipants || null,
        inviteCode,
        lat,
        lng,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: '/plan-detail', params: { id: planRef.id } });
    } catch (e: any) {
      setError(e.message || 'Failed to create plan');
    } finally {
      setLoading(false);
      setUploadingCover(false);
    }
  };

  const formattedDate = date
    ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : null;

  const formattedTime = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const formattedVoteDeadline = voteDeadline
    ? voteDeadline.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : null;

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>New Plan</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Templates */}
          {templates.length > 0 && (
            <TouchableOpacity style={styles.templateBtn} onPress={() => setShowTemplates(true)}>
              <Ionicons name="bookmark-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.templateBtnText}>Use a Template ({templates.length})</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          )}

          {/* Cover Photo */}
          <Label text="Cover Photo (optional)" />
          <TouchableOpacity style={styles.coverPicker} onPress={handlePickCover}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverPreview} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="image-outline" size={28} color={Colors.textMuted} style={{ marginBottom: 6 }} />
                <Text style={styles.coverPlaceholderText}>Tap to add a cover photo</Text>
              </View>
            )}
          </TouchableOpacity>
          {coverUri && (
            <TouchableOpacity onPress={() => setCoverUri(null)}>
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
          <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
            <Text style={{ color: date ? Colors.text : Colors.textMuted }}>
              {formattedDate || 'Pick a date'}
            </Text>
          </TouchableOpacity>
          {date && (
            <TouchableOpacity onPress={() => setDate(null)}>
              <Text style={styles.clearDate}>Clear date</Text>
            </TouchableOpacity>
          )}

          {Platform.OS === 'android' && showDatePicker && (
            <DateTimePicker
              value={date || new Date()}
              mode="date"
              minimumDate={new Date()}
              onChange={(_, selected) => { setShowDatePicker(false); if (selected) setDate(selected); }}
            />
          )}
          {Platform.OS === 'ios' && (
            <Modal visible={showDatePicker} transparent animationType="slide">
              <View style={styles.dateModalOverlay}>
                <View style={styles.dateModalContent}>
                  <View style={styles.dateModalHeader}>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.dateModalCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.dateModalDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={date || new Date()}
                    mode="date"
                    minimumDate={new Date()}
                    display="spinner"
                    onChange={(_, selected) => { if (selected) setDate(selected); }}
                    style={{ backgroundColor: Colors.card }}
                  />
                </View>
              </View>
            </Modal>
          )}

          <Label text="Time" />
          <TouchableOpacity style={[styles.input, styles.timeRow]} onPress={() => setShowTimePicker(true)}>
            <Ionicons name="time-outline" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
            <Text style={{ color: Colors.text }}>{formattedTime}</Text>
          </TouchableOpacity>

          {Platform.OS === 'android' && showTimePicker && (
            <DateTimePicker
              value={time}
              mode="time"
              is24Hour={false}
              onChange={(_, selected) => { setShowTimePicker(false); if (selected) setTime(selected); }}
            />
          )}
          {Platform.OS === 'ios' && (
            <Modal visible={showTimePicker} transparent animationType="slide">
              <View style={styles.dateModalOverlay}>
                <View style={styles.dateModalContent}>
                  <View style={styles.dateModalHeader}>
                    <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                      <Text style={styles.dateModalCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                      <Text style={styles.dateModalDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={time}
                    mode="time"
                    display="spinner"
                    onChange={(_, selected) => { if (selected) setTime(selected); }}
                    style={{ backgroundColor: Colors.card }}
                  />
                </View>
              </View>
            </Modal>
          )}

          <Label text="Vote Deadline (optional)" />
          <TouchableOpacity style={styles.input} onPress={() => setShowVoteDeadlinePicker(true)}>
            <Text style={{ color: voteDeadline ? Colors.text : Colors.textMuted }}>
              {formattedVoteDeadline || 'Pick a deadline (optional)'}
            </Text>
          </TouchableOpacity>
          {voteDeadline && (
            <TouchableOpacity onPress={() => setVoteDeadline(null)}>
              <Text style={styles.clearDate}>Clear deadline</Text>
            </TouchableOpacity>
          )}

          {Platform.OS === 'android' && showVoteDeadlinePicker && (
            <DateTimePicker
              value={voteDeadline || new Date()}
              mode="date"
              minimumDate={new Date()}
              onChange={(_, selected) => { setShowVoteDeadlinePicker(false); if (selected) setVoteDeadline(selected); }}
            />
          )}
          {Platform.OS === 'ios' && (
            <Modal visible={showVoteDeadlinePicker} transparent animationType="slide">
              <View style={styles.dateModalOverlay}>
                <View style={styles.dateModalContent}>
                  <View style={styles.dateModalHeader}>
                    <TouchableOpacity onPress={() => setShowVoteDeadlinePicker(false)}>
                      <Text style={styles.dateModalCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowVoteDeadlinePicker(false)}>
                      <Text style={styles.dateModalDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={voteDeadline || new Date()}
                    mode="date"
                    minimumDate={new Date()}
                    display="spinner"
                    onChange={(_, selected) => { if (selected) setVoteDeadline(selected); }}
                    style={{ backgroundColor: Colors.card }}
                  />
                </View>
              </View>
            </Modal>
          )}

          <Label text="Category" />
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.categoryChip, category === c && !usingCustomCategory && styles.categoryChipActive]}
                onPress={() => { setUsingCustomCategory(false); setCategory(category === c ? '' : c); }}
              >
                <Text style={[styles.categoryChipText, category === c && !usingCustomCategory && styles.categoryChipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.categoryChip, usingCustomCategory && styles.categoryChipActive]}
              onPress={() => { setUsingCustomCategory(true); setCategory(''); }}
            >
              <Text style={[styles.categoryChipText, usingCustomCategory && styles.categoryChipTextActive]}>Custom</Text>
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
            {['2', '3', '5', '7', '10'].map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.voteChip, requiredVotes === n && styles.voteChipActive]}
                onPress={() => setRequiredVotes(n)}
              >
                <Text style={[styles.voteChipText, requiredVotes === n && styles.voteChipTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Label text="Max Participants (optional)" />
          <View style={styles.voteRow}>
            {[
              { label: 'No Limit', value: null },
              { label: '5', value: 5 },
              { label: '10', value: 10 },
              { label: '15', value: 15 },
              { label: '20', value: 20 },
              { label: '30', value: 30 },
              { label: '50', value: 50 },
            ].map((opt) => (
              <TouchableOpacity
                key={String(opt.value)}
                style={[styles.voteChip, maxParticipants === opt.value && styles.voteChipActive]}
                onPress={() => setMaxParticipants(opt.value)}
              >
                <Text style={[styles.voteChipText, maxParticipants === opt.value && styles.voteChipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Label text="Visibility" />
          {accountAgeDays !== null && accountAgeDays < COOLDOWN_DAYS ? (
            <View style={styles.cooldownBanner}>
              <Ionicons name="time-outline" size={18} color={Colors.gold} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cooldownTitle}>New Account Cooldown</Text>
                <Text style={styles.cooldownText}>
                  Public events unlock in {COOLDOWN_DAYS - accountAgeDays} day{COOLDOWN_DAYS - accountAgeDays !== 1 ? 's' : ''}. This helps keep the community safe.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, !isPublic && styles.toggleBtnActive]}
                onPress={() => setIsPublic(false)}
              >
                <Text style={[styles.toggleText, !isPublic && styles.toggleTextActive]}>Private</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, isPublic && styles.toggleBtnActive]}
                onPress={() => setIsPublic(true)}
              >
                <Text style={[styles.toggleText, isPublic && styles.toggleTextActive]}>Public</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Optional Poll */}
          <TouchableOpacity
            style={styles.pollToggleBtn}
            onPress={() => { if (showPoll) setPollSubmitted(false); setShowPoll(!showPoll); Haptics.selectionAsync(); }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={showPoll ? 'remove-circle-outline' : 'add-circle-outline'} size={18} color={Colors.primary} />
              <Text style={styles.pollToggleText}>{showPoll ? 'Remove Poll' : 'Add a Poll'}</Text>
            </View>
          </TouchableOpacity>

          {showPoll && (
            <View style={styles.pollSection}>
              <Text style={styles.pollSectionLabel}>Poll Question</Text>
              <TextInput
                style={styles.input}
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
                    style={[styles.input, { flex: 1 }, pollSubmitted && !opt.trim() && styles.inputError]}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor={Colors.textMuted}
                    value={opt}
                    onChangeText={(t) => {
                      const next = [...pollOptions];
                      next[i] = t;
                      setPollOptions(next);
                    }}
                    maxLength={100}
                  />
                  {pollOptions.length > 2 && (
                    <TouchableOpacity
                      style={styles.removeOptionBtn}
                      onPress={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                    >
                      <Ionicons name="close-circle" size={22} color={Colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {pollOptions.length < 4 && (
                <TouchableOpacity
                  style={styles.addOptionBtn}
                  onPress={() => setPollOptions([...pollOptions, ''])}
                >
                  <Ionicons name="add-circle-outline" size={15} color={Colors.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.addOptionText}>Add option</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AnimatedButton
            label={uploadingCover ? 'Uploading photo...' : loading ? 'Creating...' : 'Create Plan'}
            onPress={handleCreate}
            variant="primary"
            disabled={loading}
            loading={loading}
            style={{ marginTop: 8 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Templates Modal */}
      <Modal visible={showTemplates} transparent animationType="slide">
        <View style={styles.templateModalOverlay}>
          <View style={styles.templateModalContent}>
            <View style={styles.templateModalHeader}>
              <Text style={styles.templateModalTitle}>My Templates</Text>
              <TouchableOpacity onPress={() => setShowTemplates(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={templates}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.templateItem} onPress={() => applyTemplate(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateItemTitle}>{item.name}</Text>
                    {item.description ? (
                      <Text style={styles.templateItemDesc} numberOfLines={1}>{item.description}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {item.category ? (
                        <Text style={styles.templateTag}>{item.category}</Text>
                      ) : null}
                      <Text style={styles.templateTag}>{item.requiredVotes} votes</Text>
                      {item.isPublic ? <Text style={styles.templateTag}>Public</Text> : null}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => deleteTemplate(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ paddingLeft: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.error} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
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

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
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
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  form: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 40 },
  label: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1.5 },
  input: {
    backgroundColor: Colors.backgroundAlt, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 14,
    color: Colors.text, fontSize: FontSize.md, justifyContent: 'center',
  },
  multiline: { height: 90, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  clearDate: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: -4 },
  charCount: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'right', marginTop: -4 },
  coverPicker: {
    borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1,
    borderColor: Colors.border, borderStyle: 'dashed',
  },
  coverPreview: { width: '100%', height: 140 },
  coverPlaceholder: {
    height: 100, backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center',
  },
  coverPlaceholderText: { color: Colors.textMuted, fontSize: FontSize.sm },
  dateModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  dateModalContent: { backgroundColor: Colors.surfaceRaised, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingBottom: 30 },
  dateModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dateModalCancel: { color: Colors.textSecondary, fontSize: FontSize.md },
  dateModalDone: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  categoryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border,
  },
  categoryChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryChipText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.sm },
  categoryChipTextActive: { color: Colors.text },
  voteRow: { flexDirection: 'row', gap: 8 },
  voteChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border,
  },
  voteChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  voteChipText: { color: Colors.textSecondary, fontWeight: '700' },
  voteChipTextActive: { color: Colors.text },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border,
  },
  toggleBtnActive: { backgroundColor: Colors.primary + '33', borderColor: Colors.primary },
  toggleText: { color: Colors.textSecondary, fontWeight: '600' },
  toggleTextActive: { color: Colors.primary },
  pollToggleBtn: {
    paddingVertical: 12, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  pollToggleText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.md },
  pollSection: { gap: Spacing.sm, backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  pollSectionLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeOptionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  addOptionBtn: { paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  addOptionText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  cooldownBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.gold + '15',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gold + '44',
    padding: Spacing.md,
  },
  cooldownTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.gold, marginBottom: 2 },
  cooldownText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  error: { color: Colors.error, fontSize: FontSize.sm },
  inputError: { borderColor: Colors.error, borderWidth: 1.5 },
  templateBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primary + '11', borderWidth: 1, borderColor: Colors.primary + '44',
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  templateBtnText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  templateModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  templateModalContent: {
    backgroundColor: Colors.surfaceRaised, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.lg, paddingBottom: 40, maxHeight: '70%',
  },
  templateModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  templateModalTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  templateItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  templateItemTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  templateItemDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  templateTag: {
    fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600',
    backgroundColor: Colors.primary + '18', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 99,
  },
});
