import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { getCities } from '../../lib/cities';
import type { LatLng } from '../../lib/places';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/ThemeContext';

interface Props {
  /** Label of the currently-selected location (e.g. "Cape Town" or "Near you"). */
  label: string;
  /** Called with a geocoded city centroid + its name when the user picks a city. */
  onPick: (center: LatLng, label: string) => void;
  /** Called when the user chooses "Use my location" (re-request GPS upstream). */
  onUseMyLocation: () => void;
}

/**
 * Header control that shows the current location and, when tapped, opens a city
 * picker backed by lib/cities.ts. City names are geocoded to a centroid via
 * expo-location so the caller can re-center the feed. Monochrome, no emoji.
 */
export default function LocationSwitcher({ label, onPick, onUseMyLocation }: Props) {
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  // Cities are grouped by country; default to ZA (the app's primary market and
  // the fallback centroid used elsewhere) until the user's profile loads.
  const [country, setCountry] = useState('ZA');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        const c = snap.exists() ? (snap.data().country as string) : '';
        if (!cancelled && c) setCountry(c);
      })
      .catch(() => {
        // Country stays at the ZA default — picker still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cities = useMemo(() => getCities(country), [country]);

  const pickCity = useCallback(
    async (city: string) => {
      setResolving(true);
      try {
        const results = await Location.geocodeAsync(`${city}, ${country}`);
        if (results && results.length) {
          onPick({ lat: results[0].latitude, lng: results[0].longitude }, city);
          setOpen(false);
        }
      } catch {
        // Geocode failed — leave the picker open so the user can retry.
      } finally {
        setResolving(false);
      }
    },
    [country, onPick]
  );

  const useMine = useCallback(() => {
    setOpen(false);
    onUseMyLocation();
  }, [onUseMyLocation]);

  const renderCity = useCallback(
    ({ item }: { item: string }) => (
      <TouchableOpacity
        style={styles.cityRow}
        onPress={() => pickCity(item)}
        disabled={resolving}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={item}
      >
        <Text style={styles.cityText}>{item}</Text>
        {item === label ? <Ionicons name="checkmark" size={16} color={Colors.text} /> : null}
      </TouchableOpacity>
    ),
    [styles, resolving, pickCity, label, Colors]
  );

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Change location, currently ${label}`}
      >
        <Ionicons name="location-outline" size={16} color={Colors.text} />
        <Text style={styles.triggerLabel} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Choose a location</Text>

            <TouchableOpacity
              style={styles.myLocationRow}
              onPress={useMine}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Use my location"
            >
              <Ionicons name="navigate-outline" size={18} color={Colors.text} />
              <Text style={styles.myLocationText}>Use my location</Text>
            </TouchableOpacity>

            <FlatList
              data={cities}
              keyExtractor={(c) => c}
              keyboardShouldPersistTaps="handled"
              style={styles.cityList}
              renderItem={renderCity}
              ListEmptyComponent={<Text style={styles.emptyText}>No cities available.</Text>}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const makeStyles = (Colors: ThemePalette) =>
  StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: Spacing.xs,
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surfaceRaised,
      maxWidth: 220,
    },
    triggerLabel: {
      fontSize: FontSize.sm,
      fontWeight: FontWeight.semibold,
      color: Colors.text,
      flexShrink: 1,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: Colors.surface,
      borderTopLeftRadius: Radius.lg,
      borderTopRightRadius: Radius.lg,
      paddingHorizontal: Spacing.container,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.xl,
      maxHeight: '70%',
    },
    sheetTitle: {
      fontSize: FontSize.lg,
      fontWeight: FontWeight.heavy,
      color: Colors.text,
      letterSpacing: -0.3,
      marginBottom: Spacing.sm,
    },
    myLocationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      minHeight: 48,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.borderStrong,
      marginBottom: Spacing.sm,
    },
    myLocationText: {
      fontSize: FontSize.md,
      fontWeight: FontWeight.bold,
      color: Colors.text,
    },
    cityList: {
      flexGrow: 0,
    },
    cityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
      paddingHorizontal: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    cityText: {
      fontSize: FontSize.md,
      color: Colors.text,
      fontWeight: FontWeight.medium,
    },
    emptyText: {
      fontSize: FontSize.sm,
      color: Colors.textMuted,
      paddingVertical: Spacing.md,
      textAlign: 'center',
    },
  });
