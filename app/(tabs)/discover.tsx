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
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
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
  { label: 'All',    value: 'all' },
  { label: 'Music',  value: 'Music' },
  { label: 'Food',   value: 'Food' },
  { label: 'Sports', value: 'Sports' },
  { label: 'Art',    value: 'Art' },
  { label: 'Gaming', value: 'Gaming' },
  { label: 'Travel', value: 'Travel' },
  { label: 'Party',  value: 'Party' },
  { label: 'Study',  value: 'Study' },
];

export default function DiscoverScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const router = useRouter();
  const { showToast } = useToast();

  const insets = useSafeAreaInsets();
  const [uid, setUid] = useState(auth.currentUser?.uid || '');

  // Keep uid in sync with auth state — queries must not fire unauthenticated
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid || ''));
  }, []);

  // Request location permission and get coords for distance calculation
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }).catch(() => {});
    });
  }, []);

  const plansQuery = useMemo(() => query(
    collection(db, 'plans'),
    where('isPublic', '==', true),
    where('status', 'in', ['pending', 'confirmed']),
    orderBy('createdAt', 'desc'),
    limit(50)
  ), []);

  useEffect(() => {
    if (!uid) return; // don't query until authenticated
    const unsub = onSnapshot(plansQuery, (snap) => {
      setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Plan[]);
      setLoading(false);
    }, () => {
      setLoading(false);
    });
    return unsub;
  }, [uid, plansQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const snap = await getDocs(plansQuery);
      setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Plan[]);
    } finally {
      setRefreshing(false);
    }
  }, [plansQuery]);

  const handleJoin = async (item: Plan) => {
    if (joiningId) return;
    setJoiningId(item.id);
    try {
      await updateDoc(doc(db, 'plans', item.id), {
        participants: arrayUnion(uid),
        votes: arrayUnion(uid),
      });
      showToast(`Joined "${item.title}"`, 'success');
      router.push({ pathname: '/plan-detail', params: { id: item.id } });
    } catch {
      showToast('Failed to join plan', 'error');
    } finally {
      setJoiningId(null);
    }
  };

  const isParticipant = (item: Plan) => item.participants?.includes(uid);
  const isFull = (item: Plan) =>
    !!item.maxParticipants && (item.participants?.length || 0) >= item.maxParticipants;

  const filtered = useMemo(() => {
    const result = plans.filter((p: Plan) => {
      const matchCat = category === 'all' || p.category === category;
      const matchSearch = !search || p.title?.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
    // Sort by distance when user location is available, otherwise keep createdAt order
    if (userCoords) {
      result.sort((a, b) => {
        const distA = a.lat != null && a.lng != null
          ? haversineKm(userCoords.lat, userCoords.lng, a.lat, a.lng) : Infinity;
        const distB = b.lat != null && b.lng != null
          ? haversineKm(userCoords.lat, userCoords.lng, b.lat, b.lng) : Infinity;
        return distA - distB;
      });
    }
    return result;
  }, [plans, category, search, userCoords]);

  const keyExtractor = useCallback((item: Plan) => item.id, []);

  const renderItem = useCallback(({ item, index }: { item: Plan; index: number }) => {
    const joined = isParticipant(item);
    const full = isFull(item);
    const isOwn = item.createdBy === uid;
    const distKm = userCoords && item.lat != null && item.lng != null
      ? haversineKm(userCoords.lat, userCoords.lng, item.lat, item.lng)
      : null;
    return (
      <GlassCard
        index={index}
        onPress={() =>
          router.push({
            pathname: '/plan-detail',
            params: { id: item.id },
          })
        }
        style={styles.card}
      >
        {/* Cover image with status badge — matches Home card */}
        <View style={{ position: 'relative' }}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.cardCover} />
          ) : (
            <View style={styles.cardCoverPlaceholder} />
          )}
          <View style={[
            styles.cardImageBadge,
            item.status === 'confirmed' ? styles.cardImageBadgeConfirmed : styles.cardImageBadgePending,
          ]}>
            <Text style={styles.cardImageBadgeText}>
              {item.status === 'confirmed' ? '• Confirmed' : '• Pending'}
            </Text>
          </View>
          {isOwn && (
            <View style={styles.ownCornerBadge}>
              <Text style={styles.ownCornerBadgeText}>Yours</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          {/* Category • Status */}
          <Text style={styles.cardCategoryLabel}>
            {item.category ? `${item.category.toUpperCase()} • ` : ''}
            {item.status === 'confirmed' ? 'CONFIRMED' : 'ACTIVE'}
            {distKm != null ? ` • ${formatDistance(distKm)}` : ''}
          </Text>

          {/* Title */}
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

          {/* Date + Location */}
          <View style={styles.metaRow}>
            {item.date ? (
              <View style={styles.metaChip}>
                <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.metaText}>
                  {(item.date as any)?.seconds
                    ? new Date((item.date as any).seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : String(item.date)}
                </Text>
              </View>
            ) : null}
            {item.location ? (
              <View style={styles.metaChip}>
                <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
              </View>
            ) : null}
          </View>

          {/* Quorum Status */}
          <View style={styles.progressWrapper}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>Quorum Status</Text>
              <Text style={styles.progressPct}>
                {Math.round(Math.min((item.votes?.length ?? 0) / Math.max(item.requiredVotes ?? 1, 1), 1) * 100)}%
              </Text>
            </View>
            <QuorumProgressBar
              votes={item.votes?.length ?? 0}
              required={item.requiredVotes ?? 1}
            />
          </View>
          {/* Text action — matches Home card */}
          <TouchableOpacity
            style={styles.viewDetailsBtn}
            onPress={() =>
              joined
                ? router.push({ pathname: '/plan-detail', params: { id: item.id } })
                : full
                ? undefined
                : handleJoin(item)
            }
            disabled={joiningId === item.id || (full && !joined)}
            activeOpacity={0.7}
          >
            <Text style={styles.viewDetailsBtnText}>
              {joiningId === item.id
                ? 'Joining...'
                : joined
                ? 'View Plan →'
                : full
                ? 'Plan Full'
                : 'Join Plan →'}
            </Text>
          </TouchableOpacity>
        </View>
      </GlassCard>
    );
  }, [uid, router, joiningId, userCoords, handleJoin]);

  const listHeader = (
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
      {loading ? (
        <View style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}
    </>
  );

  return (
    <ScreenWrapper>
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={keyExtractor}
        removeClippedSubviews={true}
        ListHeaderComponent={listHeader}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={loading ? null : (
          <View style={styles.empty}>
            <Ionicons name="compass-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No plans found</Text>
            <Text style={styles.emptySubtitle}>
              {search || category !== 'all'
                ? 'Try adjusting your filters'
                : 'Public plans will appear here'}
            </Text>
          </View>
        )}
        renderItem={renderItem}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.container,
    paddingBottom: Spacing.sm,
    gap: 12,
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
    gap: 8,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: FontSize.md },
  list: {
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.sm,
  },
  card: { padding: 0 },
  cardCover: {
    width: '100%',
    height: 180,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  cardCoverGradient: {
    width: '100%',
    height: 60,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  cardBody: { padding: Spacing.md, gap: 10 },
  _metaRowLegacy: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  catPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryDim,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  catText: {
    fontSize: FontSize.xs,
    color: Colors.primaryLight,
    fontWeight: FontWeight.semibold,
  },
  ownPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldDim,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
  },
  ownPillText: {
    fontSize: FontSize.xs,
    color: Colors.gold,
    fontWeight: FontWeight.semibold,
  },
  distChip: {
    backgroundColor: Colors.primaryDim,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'capitalize',
    color: Colors.textSecondary,
  },
  // ── Card — matches Home page card exactly ───────────────────────────
  cardCoverPlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#1a1a1a',
  },
  cardImageBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  cardImageBadgePending: { backgroundColor: 'rgba(0,0,0,0.55)' },
  cardImageBadgeConfirmed: { backgroundColor: Colors.secondary },
  cardImageBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  ownCornerBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: Colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
  },
  ownCornerBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  cardCategoryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  progressWrapper: { gap: 6 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  progressPct: { fontSize: 11, fontWeight: '800', color: Colors.text },
  viewDetailsBtn: { alignSelf: 'flex-end', paddingTop: 4 },
  viewDetailsBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, letterSpacing: 0.2 },
  // legacy stubs
  chipsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  joinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  joinBtnJoined: {
    backgroundColor: Colors.secondaryDim,
    borderColor: Colors.secondaryBorder,
    borderWidth: 1,
  },
  joinBtnFull: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderWidth: 1,
  },
  joinBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: '#ffffff',
  },
  joinBtnTextJoined: { color: Colors.secondary },
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
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
