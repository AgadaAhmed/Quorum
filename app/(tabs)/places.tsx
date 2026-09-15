import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import ScreenWrapper from '../../components/ScreenWrapper';
import CategoryPillRow from '../../components/CategoryPill';
import PlaceCard from '../../components/places/PlaceCard';
import TitlePopup from '../../components/places/TitlePopup';
import ProfileAvatarButton from '../../components/ProfileAvatarButton';
import InboxButton from '../../components/InboxButton';
import SkeletonCard from '../../components/SkeletonLoader';
import { Ionicons } from '@expo/vector-icons';
import { searchPlaces, type LatLng, type Place } from '../../lib/places';
import { CATEGORIES as PLAN_CATEGORIES } from '../../components/create-plan/shared';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/ThemeContext';

// Johannesburg — sensible South-Africa-wide fallback center when GPS is denied
// or unavailable. Quorum currently only serves ZA cities (see lib/cities.ts).
const DEFAULT_CENTER: LatLng = { lat: -26.2041, lng: 28.0473 };

const CATEGORY_PILLS = [
  { label: 'All', value: '' },
  ...PLAN_CATEGORIES.map((c) => ({ label: c, value: c })),
  // Dietary filters — route to a keyword text search server-side (see
  // DIETARY_QUERY in functions/index.js), not activity categories.
  { label: 'Halal', value: 'Halal' },
  { label: 'Vegan', value: 'Vegan' },
  { label: 'Vegetarian', value: 'Vegetarian' },
];

function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function PlacesScreen() {
  const router = useRouter();
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [center, setCenter] = useState<LatLng | null>(null);
  const [category, setCategory] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [venue, setVenue] = useState<Place | null>(null);
  // The Places proxy requires auth; on a cold start the session restores
  // asynchronously, so track it and only fetch once signed in (otherwise the
  // callable rejects with "Sign in required" and the fetch never retries).
  const [uid, setUid] = useState(auth.currentUser?.uid || '');

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || '')), []);

  // Same permission + coordinate flow as Discover — request foreground
  // location, fall back to a default center if denied/unavailable so the
  // screen never blocks on GPS.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setCenter(DEFAULT_CENTER);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        if (!cancelled) setCenter(DEFAULT_CENTER);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!center || !uid) return; // wait for both location and auth
    let cancelled = false;
    setLoading(true);
    searchPlaces(center, category).then((res) => {
      if (!cancelled) {
        setPlaces(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [center, category, uid]);

  const openPopup = useCallback((place: Place) => setVenue(place), []);
  const closePopup = useCallback(() => setVenue(null), []);

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

  const keyExtractor = useCallback((item: Place) => item.placeId, []);

  const renderItem = useCallback(
    ({ item }: { item: Place }) => (
      <PlaceCard
        place={item}
        distanceKm={center ? haversineKm(center, { lat: item.lat, lng: item.lng }) : null}
        variant="list"
        onPress={openPopup}
      />
    ),
    [center, openPopup]
  );

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.header}>
          <View style={styles.titleCol}>
            <Text style={styles.title}>Places</Text>
            <Text style={styles.subtitle}>Venues near you</Text>
          </View>
          <View style={styles.headerIcons}>
            <InboxButton />
            <ProfileAvatarButton />
          </View>
        </View>
        <CategoryPillRow pills={CATEGORY_PILLS} selected={category} onSelect={setCategory} />
        {loading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}
      </>
    ),
    [category, loading, styles]
  );

  const listEmpty = useMemo(
    () =>
      loading ? null : (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="location-outline" size={32} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No places found here yet</Text>
          <Text style={styles.emptySubtitle}>
            Try a different category, or check back later.
          </Text>
        </View>
      ),
    [loading, styles, Colors]
  );

  const contentContainerStyle = useMemo(() => styles.list, [styles]);

  return (
    <ScreenWrapper>
      <FlatList
        data={loading ? EMPTY_DATA : places}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
      />
      <TitlePopup
        visible={!!venue}
        venueName={venue?.name || ''}
        when={new Date()}
        onConfirm={(title) => venue && goToCreatePlan(venue, title)}
        onClose={closePopup}
      />
    </ScreenWrapper>
  );
}

const EMPTY_DATA: Place[] = [];

const makeStyles = (Colors: ThemePalette) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.container,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.sm,
    },
    titleCol: {
      gap: Spacing.xs,
      flex: 1,
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
    },
    skeletonWrap: {
      paddingHorizontal: Spacing.container,
      paddingTop: Spacing.sm,
      gap: Spacing.sm,
    },
    list: {
      paddingHorizontal: Spacing.container,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xl * 2,
      flexGrow: 1,
    },
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
  });
