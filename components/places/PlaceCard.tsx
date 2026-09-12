import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/ThemeContext';
import { Place, placePhotoUrl } from '../../lib/places';

interface Props {
  place: Place;
  distanceKm?: number | null;
  variant?: 'list' | 'carousel';
  onPress: (place: Place) => void;
}

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Food: 'restaurant-outline',
  Party: 'wine-outline',
  Sports: 'barbell-outline',
  Art: 'color-palette-outline',
  Study: 'book-outline',
  Travel: 'airplane-outline',
};

function iconForCategory(category: string): keyof typeof Ionicons.glyphMap {
  return CATEGORY_ICONS[category] || 'location-outline';
}

export default function PlaceCard({ place, distanceKm, variant = 'list', onPress }: Props) {
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhotoUrl(null);
    if (place.photoRef) {
      placePhotoUrl(place.photoRef).then((url) => {
        if (!cancelled) setPhotoUrl(url);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [place.photoRef]);

  const isCarousel = variant === 'carousel';

  const photo = photoUrl ? (
    <Image
      testID="place-card-image"
      source={{ uri: photoUrl }}
      style={isCarousel ? styles.photoCarousel : styles.photoList}
      contentFit="cover"
      accessibilityIgnoresInvertColors
    />
  ) : (
    <View style={[isCarousel ? styles.photoCarousel : styles.photoList, styles.photoPlaceholder]}>
      <Ionicons name={iconForCategory(place.category)} size={isCarousel ? 32 : 26} color={Colors.textMuted} />
    </View>
  );

  return (
    <TouchableOpacity
      style={isCarousel ? styles.cardCarousel : styles.cardList}
      onPress={() => onPress(place)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={place.name}
    >
      <View style={styles.photoWrap}>
        {photo}
        {place.featured ? (
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredBadgeText}>Featured</Text>
          </View>
        ) : null}
      </View>

      <View style={isCarousel ? styles.infoCarousel : styles.infoList}>
        <Text style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>

        <View style={styles.metaRow}>
          {place.category ? <Text style={styles.metaText}>{place.category}</Text> : null}
          {typeof place.rating === 'number' ? (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={Colors.textMuted} />
              <Text style={styles.metaText}>{place.rating.toFixed(1)}</Text>
            </View>
          ) : null}
          {typeof distanceKm === 'number' ? (
            <Text style={styles.metaText}>{distanceKm.toFixed(1)} km</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const CAROUSEL_WIDTH = 160;

const makeStyles = (Colors: ThemePalette) =>
  StyleSheet.create({
    cardList: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.surfaceRaised,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: Spacing.sm,
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    cardCarousel: {
      width: CAROUSEL_WIDTH,
      backgroundColor: Colors.surfaceRaised,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      overflow: 'hidden',
      marginRight: Spacing.sm,
    },
    photoWrap: {
      position: 'relative',
    },
    photoList: {
      width: 64,
      height: 64,
      borderRadius: Radius.md,
    },
    photoCarousel: {
      width: '100%',
      height: 96,
    },
    photoPlaceholder: {
      backgroundColor: Colors.surfaceOverlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featuredBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      backgroundColor: Colors.primary,
      borderRadius: Radius.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    featuredBadgeText: {
      fontSize: FontSize.xs,
      fontWeight: FontWeight.bold,
      color: Colors.background,
    },
    infoList: {
      flex: 1,
      justifyContent: 'center',
    },
    infoCarousel: {
      padding: Spacing.xs,
    },
    name: {
      fontSize: FontSize.md,
      fontWeight: FontWeight.semibold,
      color: Colors.text,
      marginBottom: 2,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    metaText: {
      fontSize: FontSize.xs,
      color: Colors.textMuted,
    },
  });
