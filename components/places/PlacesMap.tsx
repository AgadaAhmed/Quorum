import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import PlaceCard from './PlaceCard';
import type { LatLng, Place } from '../../lib/places';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/ThemeContext';

interface Props {
  center: LatLng;
  places: Place[];
  onPickVenue: (place: Place) => void;
}

// react-native-maps is a native module: it isn't bundled in Expo Go, so a
// top-level import would crash the app there. Load it lazily and fall back to a
// friendly message (same pattern as googleAuth / netinfo / RevenueCat).
const isExpoGo = Constants.appOwnership === 'expo';

/** Muted greyscale map style, to honour the monochrome design system. */
const MONO_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
];

export default function PlacesMap({ center, places, onPickVenue }: Props) {
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [selected, setSelected] = useState<Place | null>(null);

  const Maps = useMemo(() => {
    if (isExpoGo) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('react-native-maps');
    } catch {
      return null;
    }
  }, []);

  if (!Maps) {
    return (
      <View style={styles.unavailable}>
        <Ionicons name="map-outline" size={32} color={Colors.textMuted} />
        <Text style={styles.unavailableTitle}>Map needs the full app</Text>
        <Text style={styles.unavailableText}>
          Maps aren&apos;t available in Expo Go. Use the list view here, or open the installed
          build to see venues on the map.
        </Text>
      </View>
    );
  }

  const MapView = Maps.default;
  const { Marker, PROVIDER_GOOGLE } = Maps;

  return (
    <View style={styles.fill}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={MONO_MAP_STYLE}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onPress={() => setSelected(null)}
      >
        {places.map((p) => (
          <Marker
            key={p.placeId}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            onPress={() => setSelected(p)}
            tracksViewChanges={false}
          >
            <View style={[styles.pin, selected?.placeId === p.placeId && styles.pinActive]}>
              <Ionicons
                name="location"
                size={16}
                color={selected?.placeId === p.placeId ? Colors.background : Colors.text}
              />
            </View>
          </Marker>
        ))}
      </MapView>

      {selected ? (
        <View style={styles.previewWrap}>
          <PlaceCard place={selected} variant="list" onPress={onPickVenue} />
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => onPickVenue(selected)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Start a plan at ${selected.name}`}
          >
            <Text style={styles.startBtnText}>Start a plan here</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.background} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    pin: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.background,
      borderWidth: 2,
      borderColor: Colors.text,
    },
    pinActive: { backgroundColor: Colors.text, borderColor: Colors.text },
    previewWrap: {
      position: 'absolute',
      left: Spacing.sm,
      right: Spacing.sm,
      bottom: Spacing.sm,
      backgroundColor: Colors.background,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: Spacing.sm,
    },
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      minHeight: 44,
      borderRadius: Radius.md,
      backgroundColor: Colors.primary,
    },
    startBtnText: {
      color: Colors.background,
      fontSize: FontSize.md,
      fontWeight: FontWeight.bold,
    },
    unavailable: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.lg,
    },
    unavailableTitle: {
      fontSize: FontSize.lg,
      fontWeight: FontWeight.heavy,
      color: Colors.text,
      marginTop: Spacing.xs,
    },
    unavailableText: {
      fontSize: FontSize.sm,
      color: Colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
