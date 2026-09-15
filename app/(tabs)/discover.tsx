import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import PlacesCarousel from '../../components/places/PlacesCarousel';
import LocationSwitcher from '../../components/places/LocationSwitcher';
import TitlePopup from '../../components/places/TitlePopup';
import ProfileAvatarButton from '../../components/ProfileAvatarButton';
import InboxButton from '../../components/InboxButton';
import { type LatLng, type Place } from '../../lib/places';
import QuorumProgressBar from '../../components/QuorumProgressBar';
import PlanCover from '../../components/PlanCover';
import { isPublicPlanExpired } from '../../lib/planExpiry';
import ScreenWrapper from '../../components/ScreenWrapper';
import SkeletonCard from '../../components/SkeletonLoader';
import { useToast } from '../../components/Toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/ThemeContext';

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
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

function formatPlanDate(date: Plan['date']): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  if (typeof date.seconds === 'number') {
    const d = new Date(date.seconds * 1000);
    // Relative labels for near dates aid quick scanning; fall back to absolute.
    const startOfDay = (x: Date) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dayDiff = Math.round(
      (startOfDay(d) - startOfDay(new Date())) / 86400000
    );
    if (dayDiff === 0) return 'Today';
    if (dayDiff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return null;
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
  createdAt?: { seconds: number } | string;
  isPaid?: boolean;
  price?: number;
  place?: { photoRef?: string | null };
}

/** "Free" or "R120" — the cost label for a plan. */
function costLabel(p: { isPaid?: boolean; price?: number }): string {
  if (!p.isPaid || !p.price) return 'Free';
  return `R${p.price % 1 === 0 ? p.price : p.price.toFixed(2)}`;
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
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
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
    ? 'Joining'
    : joined
    ? 'View plan'
    : full
    ? 'Plan full'
    : 'Join plan';

  const disabled = joining || (full && !joined);
  // Joined plans are a return action, not the primary CTA — render them quietly.
  const secondary = joined;

  return (
    <GlassCard index={index} onPress={handleCardPress} style={styles.card}>
      <View style={styles.coverWrap}>
        <PlanCover
          category={item.category}
          seed={item.id}
          photoRef={item.place?.photoRef}
          variant="card"
          style={styles.cardCover}
        />
        {/* Scrim keeps white badge text legible over any cover image. */}
        <LinearGradient
          colors={SCRIM_COLORS}
          start={SCRIM_START}
          end={SCRIM_END}
          style={styles.coverScrim}
          pointerEvents="none"
        />
        <View style={styles.cardBadgeRow}>
          {isOwn ? (
            <View style={styles.cardBadge}>
              <Text style={styles.cardBadgeText}>YOURS</Text>
            </View>
          ) : null}
          <View
            style={[
              styles.cardBadge,
              confirmed ? styles.cardBadgeSolid : styles.cardBadgeOutline,
            ]}
          >
            <Ionicons
              name={confirmed ? 'checkmark-circle' : 'time-outline'}
              size={12}
              color={'#ffffff'}
            />
            <Text style={styles.cardBadgeText}>
              {confirmed ? 'CONFIRMED' : 'PENDING'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardBody}>
        {item.category ? (
          <Text style={styles.cardCategoryLabel} numberOfLines={1}>
            {item.category.toUpperCase()}
          </Text>
        ) : null}

        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={styles.metaRow}>
          {dateLabel ? (
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>{dateLabel}</Text>
            </View>
          ) : null}
          {item.location ? (
            <View style={[styles.metaChip, styles.metaChipFlex]}>
              <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
          ) : null}
          {distKm != null ? (
            <View style={styles.metaChip}>
              <Ionicons name="navigate-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>{formatDistance(distKm)}</Text>
            </View>
          ) : null}
          <View style={styles.metaChip}>
            <Ionicons
              name={item.isPaid && item.price ? 'card-outline' : 'pricetag-outline'}
              size={14}
              color={Colors.textMuted}
            />
            <Text style={styles.metaText}>{costLabel(item)}</Text>
          </View>
        </View>

        <View style={styles.progressWrapper}>
          {/* QuorumProgressBar renders its own votes/percent header row. */}
          <Text style={styles.progressLabel}>QUORUM</Text>
          <QuorumProgressBar votes={votes} required={required} />
        </View>

        <TouchableOpacity
          style={[
            styles.actionBtn,
            secondary && styles.actionBtnSecondary,
            disabled && styles.actionBtnDisabled,
          ]}
          onPress={handleAction}
          disabled={disabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          accessibilityLabel={`${actionLabel}: ${item.title}`}
        >
          {joining ? (
            <ActivityIndicator size="small" color={'#ffffff'} />
          ) : (
            <>
              <Text
                style={[
                  styles.actionBtnText,
                  secondary && styles.actionBtnTextSecondary,
                  disabled && styles.actionBtnTextDisabled,
                ]}
              >
                {actionLabel}
              </Text>
              <Ionicons
                name={joined ? 'arrow-forward' : full ? 'lock-closed' : 'add'}
                size={16}
                color={
                  disabled
                    ? Colors.textMuted
                    : secondary
                    ? Colors.text
                    : '#ffffff'
                }
              />
            </>
          )}
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
});

const SCRIM_COLORS: [string, string] = ['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)'];
const SCRIM_START = { x: 0.5, y: 0 };
const SCRIM_END = { x: 0.5, y: 1 };

export default function DiscoverScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  // `center` drives BOTH the places carousel and the public-quorums distance
  // sort; it defaults to the user's GPS but the location switcher can move it to
  // another city so users can scout events/places elsewhere.
  const [center, setCenter] = useState<Coords | null>(null);
  const [cityLabel, setCityLabel] = useState('Near you');
  const [venue, setVenue] = useState<Place | null>(null);
  const [uid, setUid] = useState(auth.currentUser?.uid || '');
  const router = useRouter();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);

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
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords(coords);
          // Seed the feed center from GPS unless the user already moved it.
          setCenter((c) => c ?? coords);
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

  const openTitlePopup = useCallback((place: Place) => setVenue(place), []);
  const closeTitlePopup = useCallback(() => setVenue(null), []);

  const goToCreatePlan = useCallback(
    (place: Place, title: string) => {
      setVenue(null);
      router.push({
        pathname: '/create-plan',
        params: {
          title,
          placeJson: JSON.stringify({
            placeId: place.placeId,
            name: place.name,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
            photoRef: place.photoRef ?? '',
            category: place.category,
            source: 'google',
            featured: false,
          }),
        },
      } as any);
    },
    [router]
  );

  const onPickLocation = useCallback((c: LatLng, label: string) => {
    setCenter(c);
    setCityLabel(label);
  }, []);

  const useMyLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserCoords(coords);
      setCenter(coords);
      setCityLabel('Near you');
    } catch {
      // GPS unavailable — keep the current center.
    }
  }, []);

  // The distance sort/labels follow the switcher's chosen center, falling back
  // to raw GPS until either resolves.
  const geoCenter = center ?? userCoords;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = plans.filter((p) => {
      const matchCat = category === 'all' || p.category === category;
      const matchSearch = !q || p.title?.toLowerCase().includes(q);
      // Public plans expire out of Discover 3 days after their event/creation.
      const notExpired = !(p.isPublic && isPublicPlanExpired(p));
      return matchCat && matchSearch && notExpired;
    });
    // Sort by distance from the chosen center when available, else keep createdAt order
    if (geoCenter) {
      const dist = (p: Plan) =>
        p.lat != null && p.lng != null
          ? haversineKm(geoCenter.lat, geoCenter.lng, p.lat, p.lng)
          : Infinity;
      result.sort((a, b) => dist(a) - dist(b));
    }
    return result;
  }, [plans, category, search, geoCenter]);

  const keyExtractor = useCallback((item: Plan) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Plan; index: number }) => {
      const distKm =
        geoCenter && item.lat != null && item.lng != null
          ? haversineKm(geoCenter.lat, geoCenter.lng, item.lat, item.lng)
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
    [uid, geoCenter, joiningId, goToPlan, handleJoin]
  );

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.header}>
          <View style={styles.topRow}>
            <LocationSwitcher
              label={cityLabel}
              onPick={onPickLocation}
              onUseMyLocation={useMyLocation}
            />
            <View style={styles.headerIcons}>
              <InboxButton />
              <ProfileAvatarButton />
            </View>
          </View>
          <Text style={styles.title}>Discover</Text>
          <Text style={styles.subtitle}>Public plans near you</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color={Colors.textMuted} />
            <TextInput
              placeholder="Search plans"
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="never"
              accessibilityLabel="Search plans"
            />
            {search.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={HIT_SLOP}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        {geoCenter && uid ? (
          <View style={styles.carouselSection}>
            <Text style={styles.sectionHeading}>Places near you</Text>
            <PlacesCarousel center={geoCenter} onPickVenue={openTitlePopup} />
          </View>
        ) : null}
        <Text style={[styles.sectionHeading, styles.feedHeading]}>Public quorums near you</Text>
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
    [
      search,
      category,
      loading,
      styles,
      Colors,
      cityLabel,
      onPickLocation,
      useMyLocation,
      geoCenter,
      openTitlePopup,
      uid,
    ]
  );

  const hasFilters = !!search || category !== 'all';
  const clearFilters = useCallback(() => {
    setSearch('');
    setCategory('all');
  }, []);

  const listEmpty = useMemo(
    () =>
      loading ? null : (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="compass-outline" size={32} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No plans found</Text>
          <Text style={styles.emptySubtitle}>
            {hasFilters
              ? 'No plans match your search and filters. Try broadening them.'
              : 'There are no public plans yet. Pull down to refresh, or check back soon.'}
          </Text>
          {hasFilters ? (
            <TouchableOpacity
              style={styles.emptyAction}
              onPress={clearFilters}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Clear filters"
            >
              <Text style={styles.emptyActionText}>Clear filters</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ),
    [loading, hasFilters, clearFilters, styles, Colors]
  );

  const contentContainerStyle = useMemo(
    () => [styles.list, { paddingBottom: insets.bottom + 90 }],
    [insets.bottom, styles]
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
      <TitlePopup
        visible={!!venue}
        venueName={venue?.name || ''}
        rating={venue?.rating}
        reviewCount={venue?.userRatingCount}
        reviews={venue?.reviews}
        when={new Date()}
        onConfirm={(title) => venue && goToCreatePlan(venue, title)}
        onClose={closeTitlePopup}
      />
    </ScreenWrapper>
  );
}

const EMPTY_DATA: Plan[] = [];
const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.md,
    paddingVertical: 0,
  },
  skeletonWrap: {
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  carouselSection: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  sectionHeading: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: Spacing.container,
  },
  feedHeading: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  list: {
    paddingHorizontal: Spacing.container,
    paddingTop: Spacing.sm,
    flexGrow: 1,
  },
  card: { padding: 0 },
  coverWrap: { position: 'relative' },
  cardCover: { width: '100%', height: 176 },
  coverScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  cardBadgeRow: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs * 2,
  },
  cardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm - 2,
    paddingVertical: Spacing.xs + 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.overlay,
  },
  // Confirmed = solid near-black fill; pending = translucent + hairline ring.
  cardBadgeSolid: { backgroundColor: 'rgba(0,0,0,0.78)' },
  cardBadgeOutline: {
    backgroundColor: Colors.overlay,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  cardBadgeText: {
    color: '#ffffff',
    fontSize: FontSize.xs - 2,
    fontWeight: FontWeight.heavy,
    letterSpacing: 1,
  },
  cardBody: { padding: Spacing.md, gap: Spacing.sm },
  cardCategoryLabel: {
    fontSize: FontSize.xs - 2,
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
    lineHeight: 30,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs + 2 },
  metaChipFlex: { flexShrink: 1 },
  metaText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
  progressWrapper: { gap: Spacing.xs + 2, marginTop: Spacing.xs },
  progressLabel: {
    fontSize: FontSize.xs - 1,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs + 2,
    minHeight: 48,
    marginTop: Spacing.xs,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  actionBtnDisabled: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 0,
  },
  actionBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  actionBtnTextSecondary: { color: Colors.text },
  actionBtnTextDisabled: { color: Colors.textMuted },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl * 2,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  emptyAction: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  emptyActionText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    letterSpacing: 0.2,
  },
});
