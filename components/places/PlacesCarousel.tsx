import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PlaceCard from './PlaceCard';
import { searchPlaces, type LatLng, type Place } from '../../lib/places';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/ThemeContext';

interface Props {
  center: LatLng;
  /** Called when a venue card is tapped — the parent opens the title popup. */
  onPickVenue: (place: Place) => void;
}

/**
 * Horizontal, swipeable venue carousel for the Discover feed. Horizontal-only so
 * it nests safely inside Discover's vertical FlatList header. Shares lib/places
 * with the Places tab (one cache). A trailing "See all" card jumps to the tab.
 */
export default function PlacesCarousel({ center, onPickVenue }: Props) {
  const router = useRouter();
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchPlaces(center).then((res) => {
      if (!cancelled) {
        setPlaces(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // Depend on primitive coords so a fresh {lat,lng} object identity alone
    // doesn't trigger a redundant refetch.
  }, [center.lat, center.lng]);

  const renderItem = useCallback(
    ({ item }: { item: Place }) => (
      <PlaceCard place={item} variant="carousel" onPress={onPickVenue} />
    ),
    [onPickVenue]
  );

  const seeAll = useCallback(
    () => (
      <TouchableOpacity
        style={styles.seeAllCard}
        onPress={() => router.push('/places' as any)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="See all places"
      >
        <Ionicons name="arrow-forward" size={22} color={Colors.text} />
        <Text style={styles.seeAllText}>See all</Text>
      </TouchableOpacity>
    ),
    [styles, router, Colors]
  );

  if (loading) {
    return (
      <View style={styles.skeletonRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.skeletonCard} />
        ))}
      </View>
    );
  }

  if (!places.length) {
    return <Text style={styles.emptyLine}>No places nearby yet.</Text>;
  }

  return (
    <FlatList
      horizontal
      data={places}
      keyExtractor={(item) => item.placeId}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      ListFooterComponent={seeAll}
    />
  );
}

const CAROUSEL_HEIGHT = 150;

const makeStyles = (Colors: ThemePalette) =>
  StyleSheet.create({
    listContent: {
      paddingHorizontal: Spacing.container,
    },
    skeletonRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.container,
    },
    skeletonCard: {
      width: 160,
      height: CAROUSEL_HEIGHT,
      borderRadius: Radius.md,
      backgroundColor: Colors.surfaceRaised,
    },
    emptyLine: {
      fontSize: FontSize.sm,
      color: Colors.textMuted,
      paddingHorizontal: Spacing.container,
      paddingVertical: Spacing.sm,
    },
    seeAllCard: {
      width: 96,
      height: CAROUSEL_HEIGHT,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
    },
    seeAllText: {
      fontSize: FontSize.sm,
      fontWeight: FontWeight.bold,
      color: Colors.text,
    },
  });
