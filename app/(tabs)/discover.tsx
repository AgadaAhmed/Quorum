import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import CategoryPillRow from '../../components/CategoryPill';
import GlassCard from '../../components/GlassCard';
import QuorumProgressBar from '../../components/QuorumProgressBar';
import ScreenWrapper from '../../components/ScreenWrapper';
import SkeletonCard from '../../components/SkeletonLoader';
import { useToast } from '../../components/Toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

function formatPlanDate(date: Plan['date']): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  if (typeof date.seconds === 'number') {
    return new Date(date.seconds * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
  return null;
}

function quorumPct(votes: number, required: number): number {
  return Math.round(Math.min(votes / Math.max(required, 1), 1) * 100);
}

interface Coords {
  lat: number;
  lng: number;
}

interface Plan {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'confirmed' | 'archived';
  category?: string;
  date?: { seconds: number } | string;
  location?: string;
  lat?: number;
  lng?: number;
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
  { label: 'Music', value: 'Music' },
  { label: 'Food', value: 'Food' },
  { label: 'Sports', value: 'Sports' },
  { label: 'Art', value: 'Art' },
  { label: 'Gaming', value: 'Gaming' },
  { label: 'Travel', value: 'Travel' },
  { label: 'Party', value: 'Party' },
  { label: 'Study', value: 'Study' },
];

// ── Card (memoized) ──────────────────────────────────────────────────────────
interface PlanCardProps {
  item: Plan;
  index: number;
  joined: boolean;
  full: boolean;
  isOwn: boolean;
  distKm: number | null;
  joining: boolean;
  onPress: (id: string) => void;
  onJoin: (item: Plan) => void;
}

const PlanCard = React.memo(function PlanCard({
  item,
  index,
  joined,
  full,
  isOwn,
  distKm,
  joining,
  onPress,
  onJoin,
}: PlanCardProps) {
  const dateLabel = formatPlanDate(item.date);
  const votes = item.votes?.length ?? 0;
  const required = item.requiredVotes ?? 1;
  const confirmed = item.status === 'confirmed';

  const handleCardPress = useCallback(() => onPress(item.id), [onPress, item.id]);

  const handleAction = useCallback(() => {
    if (joined) onPress(item.id);
    else if (!full) onJoin(item);
  }, [joined, full, onPress, onJoin, item]);

  const actionLabel = joining
    ? 'Joining...'
    : joined
    ? 'View Plan'
    : full
    ? 'Plan Full'
    : 'Join Plan';

  return (
    <GlassCard index={index} onPress={handleCardPress} style={styles.card}>
      <View style={styles.coverWrap}>
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={styles.cardCover} />
        ) : (
          <View style={styles.cardCoverPlaceholder} />
        )}
        <View
          style={[
            styles.cardImageBadge,
            confirmed ? styles.cardImageBadgeConfirmed : styles.cardImageBadgePending,
          ]}
        >
          <Text style={styles.cardImageBadgeText}>
            {confirmed ? 'Confirmed' : 'Pending'}
          </Text>
        </View>
        {isOwn ? (
          <View style={styles.ownCornerBadge}>
            <Text style={styles.ownCornerBadgeText}>Yours</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardCategoryLabel} numberOfLines={1}>
          {item.category ? `${item.category.toUpperCase()} · ` : ''}
          {confirmed ? 'CONFIRMED' : 'ACTIVE'}
          {distKm != null ? ` · ${formatDistance(distKm)}` : ''}
        </Text>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>

        {(dateLabel || item.location) ? (
          <View style={styles.metaRow}>
            {dateLabel ? (
              <View style={styles.metaChip}>
                <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.metaText}>{dateLabel}</Text>
              </View>
            ) : null}
            {item.location ? (
              <View style={styles.metaChip}>
                <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.location}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.progressWrapper}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>Quorum Status</Text>
            <Text style={styles.progressPct}>{quorumPct(votes, required)}%</Text>
          </View>
          <QuorumProgressBar votes={votes} required={required} />
        </View>

        <TouchableOpacity
          style={styles.viewDetailsBtn}
          onPress={handleAction}
          disabled={joining || (full && !joined)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${item.title}`}
        >
          <Text
            style={[
              styles.viewDetailsBtnText,
              full && !joined ? styles.viewDetailsBtnTextDisabled : null,
            ]}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
});

export default function DiscoverScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [uid, setUid] = useState(auth.currentUser?.uid || '');
  const router = useRouter();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  // Keep uid in sync with auth state — queries must not fire unauthenticated
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || '')), []);

  // Request location permission and get coords for distance calculation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        // Location unavailable — distance sorting is simply skipped.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const plansQuery = useMemo(
    () =>
      query(
        collection(db, 'plans'),
        where('isPublic', '==', true),
        where('status', 'in', ['pending', 'confirmed']),
        orderBy('createdAt', 'desc'),
        limit(50)
      ),
    []
  );

  useEffect(() => {
    if (!uid) return; // don't query until authenticated
    const unsub = onSnapshot(
      plansQuery,
      (snap) => {
        setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Plan[]);
        setLoading(false);
      },
      () => {
        setLoading(false);
        showToast('Could not load plans', 'error');
      }
    );
    return unsub;
  }, [uid, plansQuery, showToast]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const snap = await getDocs(plansQuery);
      setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Plan[]);
    } catch {
      showToast('Could not refresh', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [plansQuery, showToast]);

  const goToPlan = useCallback(
    (id: string) => router.push({ pathname: '/plan-detail', params: { id } }),
    [router]
  );

  const handleJoin = useCallback(
    async (item: Plan) => {
      if (joiningId || !uid) return;
      setJoiningId(item.id);
      try {
        await updateDoc(doc(db, 'plans', item.id), {
          participants: arrayUnion(uid),
          votes: arrayUnion(uid),
        });
        showToast(`Joined "${item.title}"`, 'success');
        goToPlan(item.id);
      } catch {
        showToast('Failed to join plan', 'error');
      } finally {
        setJoiningId(null);
      }
    },
    [joiningId, uid, showToast, goToPlan]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = plans.filter((p) => {
      const matchCat = category === 'all' || p.category === category;
      const matchSearch = !q || p.title?.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
    // Sort by distance when user location is available, otherwise keep createdAt order
    if (userCoords) {
      const dist = (p: Plan) =>
        p.lat != null && p.lng != null
          ? haversineKm(userCoords.lat, userCoords.lng, p.lat, p.lng)
          : Infinity;
      result.sort((a, b) => dist(a) - dist(b));
    }
    return result;
  }, [plans, category, search, userCoords]);

  const keyExtractor = useCallback((item: Plan) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Plan; index: number }) => {
      const distKm =
        userCoords && item.lat != null && item.lng != null
          ? haversineKm(userCoords.lat, userCoords.lng, item.lat, item.lng)
          : null;
      return (
        <PlanCard
          item={item}
          index={index}
          joined={!!item.participants?.includes(uid)}
          full={
            !!item.maxParticipants &&
            (item.participants?.length || 0) >= item.maxParticipants
          }
          isOwn={item.createdBy === uid}
          distKm={distKm}
          joining={joiningId === item.id}
          onPress={goToPlan}
          onJoin={handleJoin}
        />
      );
    },
    [uid, userCoords, joiningId, goToPlan, handleJoin]
  );

  const listHeader = useMemo(
    () => (
      <>
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
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search plans"
            />
            {search.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <CategoryPillRow pills={CATEGORIES} selected={category} onSelect={setCategory} />
        {loading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}
      </>
    ),
    [search, category, loading]
  );

  const listEmpty = useMemo(
    () =>
      loading ? null : (
        <View style={styles.empty}>
          <Ionicons name="compass-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No plans found</Text>
          <Text style={styles.emptySubtitle}>
            {search || category !== 'all'
              ? 'Try adjusting your filters'
              : 'Public plans will appear here'}
          </Text>
        </View>
      ),
    [loading, search, category]
  );

  const contentContainerStyle = useMemo(
    () => [styles.list, { paddingBottom: insets.bottom + 90 }],
    [insets.bottom]
  );

  return (
    <ScreenWrapper>
      <FlatList
        data={loading ? EMPTY_DATA : filtered}
        keyExtractor={keyExtractor}
        removeClippedSubviews
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={9}
        ListHeaderComponent={listHeader}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={listEmpty}
        renderItem={renderItem}
      />
    </ScreenWrapper>
  );
}

const EMPTY_DATA: Plan[] = [];
const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.container,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs * 2,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: FontSize.md },
  skeletonWrap: {
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  list: {
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.sm,
    flexGrow: 1,
  },
  card: { padding: 0 },
  coverWrap: { position: 'relative' },
  cardCover: { width: '100%', height: 180 },
  cardCoverPlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.surfaceRaised,
  },
  cardBody: { padding: Spacing.md, gap: 10 },
  cardImageBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  cardImageBadgePending: { backgroundColor: Colors.overlay },
  cardImageBadgeConfirmed: { backgroundColor: Colors.secondary },
  cardImageBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  ownCornerBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: Colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
  },
  ownCornerBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: FontWeight.heavy },
  cardCategoryLabel: {
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  progressWrapper: { gap: 6 },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  progressPct: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.text },
  viewDetailsBtn: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  viewDetailsBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    letterSpacing: 0.2,
  },
  viewDetailsBtnTextDisabled: { color: Colors.textMuted },
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
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
