import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import PlacesMap from '../../components/places/PlacesMap';
import TitlePopup from '../../components/places/TitlePopup';
import ChatScreen from '../chat';
import FriendsScreen from '../social';
import ActivityScreen from './activity';
import { searchPlaces, type LatLng, type Place } from '../../lib/places';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/ThemeContext';

// Johannesburg fallback, matching the Places tab.
const DEFAULT_CENTER: LatLng = { lat: -26.2041, lng: 28.0473 };

type Segment = 'map' | 'chat' | 'friends' | 'activity';
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'map', label: 'Map' },
  { key: 'chat', label: 'Chat' },
  { key: 'friends', label: 'Friends' },
  { key: 'activity', label: 'Activity' },
];

/**
 * The Social tab — one home for everything people-facing:
 *  • Map      — venues near you as pins; tap one to start a quorum there
 *  • Chat     — the global room (ChatScreen with no params defaults to 'global')
 *  • Friends  — the friends list / search / requests screen
 *  • Activity — the notification feed (moved here off the bottom bar)
 * The Chat/Friends/Activity segments render the existing screens directly, so
 * there's a single implementation of each rather than a parallel copy.
 */
export default function ConnectScreen() {
  const router = useRouter();
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  // The global chat renders inside this tab, above the bottom tab bar. Its
  // KeyboardAvoidingView needs that height as an offset or the keyboard covers
  // the input (the same screen used as a pushed DM route needs no offset).
  const tabBarHeight = useBottomTabBarHeight();
  const [segment, setSegment] = useState<Segment>('map');

  // Map data (only fetched once the map segment is actually opened).
  const [center, setCenter] = useState<LatLng | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [venue, setVenue] = useState<Place | null>(null);
  const [uid, setUid] = useState(auth.currentUser?.uid || '');

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || '')), []);

  useEffect(() => {
    if (segment !== 'map' || center) return;
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
        if (!cancelled) setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        if (!cancelled) setCenter(DEFAULT_CENTER);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [segment, center]);

  useEffect(() => {
    // The Places proxy requires auth; wait for the session to restore.
    if (!center || !uid) return;
    let cancelled = false;
    searchPlaces(center).then((res) => {
      if (!cancelled) setPlaces(res);
    });
    return () => {
      cancelled = true;
    };
  }, [center, uid]);

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

  const body = useMemo(() => {
    switch (segment) {
      case 'chat':
        return <ChatScreen keyboardVerticalOffset={tabBarHeight} />;
      case 'friends':
        return <FriendsScreen />;
      case 'activity':
        return <ActivityScreen />;
      case 'map':
      default:
        return center ? (
          <PlacesMap center={center} places={places} onPickVenue={setVenue} />
        ) : (
          <View style={styles.loading}>
            <Text style={styles.loadingText}>Finding places near you…</Text>
          </View>
        );
    }
  }, [segment, center, places, styles, tabBarHeight]);

  return (
    <View style={styles.fill}>
      <SafeAreaView edges={SAFE_EDGES} style={styles.barWrap}>
        <View style={styles.segmentRow}>
          {SEGMENTS.map((s) => {
            const active = s.key === segment;
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => setSegment(s.key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      <View style={styles.body}>{body}</View>

      <TitlePopup
        visible={!!venue}
        venueName={venue?.name || ''}
        rating={venue?.rating}
        reviewCount={venue?.userRatingCount}
        reviews={venue?.reviews}
        when={new Date()}
        onConfirm={(title) => venue && goToCreatePlan(venue, title)}
        onClose={() => setVenue(null)}
      />
    </View>
  );
}

const SAFE_EDGES = ['top', 'left', 'right'] as const;

const makeStyles = (Colors: ThemePalette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: Colors.background },
    barWrap: { backgroundColor: Colors.background },
    segmentRow: {
      flexDirection: 'row',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    segment: {
      flex: 1,
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    segmentActive: { backgroundColor: Colors.surfaceRaised, borderColor: Colors.border },
    segmentText: {
      fontSize: FontSize.sm,
      fontWeight: FontWeight.semibold,
      color: Colors.textMuted,
    },
    segmentTextActive: { color: Colors.text, fontWeight: FontWeight.bold },
    body: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: Colors.textMuted, fontSize: FontSize.sm },
  });
