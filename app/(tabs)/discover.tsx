import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import CategoryPillRow from '../../components/CategoryPill';
import GlassCard from '../../components/GlassCard';
import QuorumProgressBar from '../../components/QuorumProgressBar';
import ScreenWrapper from '../../components/ScreenWrapper';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';

interface Plan {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'confirmed' | 'archived';
  category?: string;
  date?: { seconds: number } | string;
  location?: string;
  votes?: string[];
  requiredVotes?: number;
  participants?: string[];
  coverUrl?: string;
  createdBy?: string;
  isPublic?: boolean;
  poll?: { question: string; options: string[]; votes: Record<string, string> };
  maxParticipants?: number;
  inviteCode?: string;
}

const CATEGORIES = [
  { label: 'All', value: 'all' },
  { label: 'Sports', value: 'Sports' },
  { label: 'Food', value: 'Food & Drink' },
  { label: 'Music', value: 'Music' },
  { label: 'Arts', value: 'Arts & Culture' },
  { label: 'Outdoors', value: 'Outdoors' },
  { label: 'Social', value: 'Social' },
  { label: 'Other', value: 'Other' },
];

export default function DiscoverScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const router = useRouter();

  const uid = auth.currentUser?.uid || '';

  useEffect(() => {
    const q = query(
      collection(db, 'plans'),
      where('isPublic', '==', true),
      where('status', 'in', ['pending', 'confirmed']),
      orderBy('createdAt', 'desc'),
      limit(40)
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.createdBy !== uid);
      setPlans(data);
    });
    return unsub;
  }, []);

  const handleJoin = async (item: Plan) => {
    if (joiningId) return;
    setJoiningId(item.id);
    try {
      await updateDoc(doc(db, 'plans', item.id), {
        participants: arrayUnion(uid),
        votes: arrayUnion(uid),
      });
      Alert.alert(
        "Tell someone you're going",
        `Let a trusted contact know you're attending "${item.title}"${item.location ? ` at ${item.location}` : ''}.`,
        [
          {
            text: 'Share',
            onPress: () =>
              Share.share({
                message: `I'm going to "${item.title}"${item.location ? ` at ${item.location}` : ''}. If you don't hear from me after, check on me! (Sent from Quorum)`,
              }),
          },
          { text: 'Skip', style: 'cancel' },
        ]
      );
      router.push({ pathname: '/plan-detail', params: { id: item.id } });
    } finally {
      setJoiningId(null);
    }
  };

  const isParticipant = (item: Plan) => item.participants?.includes(uid);
  const isFull = (item: Plan) =>
    !!item.maxParticipants && (item.participants?.length || 0) >= item.maxParticipants;

  const filtered = useMemo(() => plans.filter((p: Plan) => {
    const matchCat = category === 'all' || p.category === category;
    const matchSearch =
      !search || p.title?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [plans, category, search]);

  const keyExtractor = useCallback((item: Plan) => item.id, []);

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            placeholder="Search plans..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <CategoryPillRow
        pills={CATEGORIES}
        selected={category}
        onSelect={setCategory}
      />

      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        removeClippedSubviews={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="compass-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No plans found</Text>
            <Text style={styles.emptySubtitle}>
              {search || category !== 'all'
                ? 'Try adjusting your filters'
                : 'Public plans will appear here'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const joined = isParticipant(item);
          const full = isFull(item);
          return (
            <GlassCard
              index={index}
              onPress={() =>
                router.push({
                  pathname: '/plan-detail',
                  params: { id: item.id },
                })
              }
              glowColor={
                item.status === 'confirmed' ? Colors.success : Colors.primary
              }
              style={styles.card}
            >
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={styles.cardCover} />
              ) : (
                <LinearGradient
                  colors={['#f43f5e22', '#100d14']}
                  style={styles.cardCoverGradient}
                />
              )}
              <View style={styles.cardBody}>
                <View style={styles.metaRow}>
                  {item.category ? (
                    <View style={styles.catPill}>
                      <Text style={styles.catText}>{item.category}</Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          item.status === 'confirmed'
                            ? Colors.success
                            : Colors.primary,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusLabel,
                      {
                        color:
                          item.status === 'confirmed'
                            ? Colors.success
                            : Colors.primary,
                      },
                    ]}
                  >
                    {item.status}
                  </Text>
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.chipsRow}>
                  {item.date ? (
                    <View style={styles.chip}>
                      <Ionicons
                        name="calendar-outline"
                        size={11}
                        color={Colors.textMuted}
                      />
                      <Text style={styles.chipText}>
                        {item.date?.seconds
                          ? new Date(item.date.seconds * 1000).toLocaleDateString(
                              'en-US',
                              { month: 'short', day: 'numeric' }
                            )
                          : item.date}
                      </Text>
                    </View>
                  ) : null}
                  {item.location ? (
                    <View style={styles.chip}>
                      <Ionicons
                        name="location-outline"
                        size={11}
                        color={Colors.textMuted}
                      />
                      <Text style={styles.chipText} numberOfLines={1}>
                        {item.location}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.chip}>
                    <Ionicons
                      name="people-outline"
                      size={11}
                      color={Colors.textMuted}
                    />
                    <Text style={styles.chipText}>
                      {item.participants?.length ?? 0}
                      {item.maxParticipants ? `/${item.maxParticipants}` : ''}
                    </Text>
                  </View>
                </View>
                <QuorumProgressBar
                  votes={item.votes?.length ?? 0}
                  required={item.requiredVotes ?? 1}
                />
                <TouchableOpacity
                  style={[
                    styles.joinBtn,
                    joined && styles.joinBtnJoined,
                    full && !joined && styles.joinBtnFull,
                  ]}
                  onPress={() =>
                    joined
                      ? router.push({ pathname: '/plan-detail', params: { id: item.id } })
                      : full
                      ? undefined
                      : handleJoin(item)
                  }
                  disabled={joiningId === item.id || (full && !joined)}
                >
                  <Ionicons
                    name={
                      joined
                        ? 'checkmark-circle-outline'
                        : full
                        ? 'close-circle-outline'
                        : 'enter-outline'
                    }
                    size={15}
                    color={
                      joined ? Colors.success : full ? Colors.textMuted : Colors.primary
                    }
                  />
                  <Text
                    style={[
                      styles.joinBtnText,
                      joined && styles.joinBtnTextJoined,
                      full && !joined && styles.joinBtnTextFull,
                    ]}
                  >
                    {joiningId === item.id
                      ? 'Joining...'
                      : joined
                      ? 'View Plan'
                      : full
                      ? 'Full'
                      : 'Join Plan'}
                  </Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          );
        }}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 12,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: FontSize.md },
  list: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 100,
  },
  card: { padding: 0 },
  cardCover: {
    width: '100%',
    height: 130,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  cardCoverGradient: {
    width: '100%',
    height: 60,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  cardBody: { padding: Spacing.md, gap: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryDim,
  },
  catText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'capitalize',
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: { fontSize: FontSize.xs, color: Colors.textMuted, maxWidth: 120 },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryDim,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  joinBtnJoined: {
    backgroundColor: Colors.success + '22',
    borderColor: Colors.success + '44',
  },
  joinBtnFull: {
    backgroundColor: Colors.surface,
    borderColor: Colors.glassBorder,
  },
  joinBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  joinBtnTextJoined: { color: Colors.success },
  joinBtnTextFull: { color: Colors.textMuted },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 80,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
