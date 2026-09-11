import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { Fonts, FontSize, FontWeight, Spacing, type ThemePalette } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/ThemeContext';

// A thin top banner that slides in when the device loses connectivity, so
// network failures aren't silent. Mounted once at the app root. pointerEvents is
// disabled so it never intercepts taps.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const insets = useSafeAreaInsets();
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      // Only treat a definitive disconnect as offline; `null` (unknown) stays
      // online to avoid a false banner on startup / transient states.
      setOffline(state.isConnected === false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: offline ? 0 : -120,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [offline, translateY]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        { paddingTop: insets.top + Spacing.xs, transform: [{ translateY }] },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={14} color={Colors.background} />
      <Text style={styles.text}>You&apos;re offline</Text>
    </Animated.View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs + 2,
    paddingBottom: Spacing.sm,
    // Inverted bar (ink background, light text) reads clearly in both palettes.
    backgroundColor: Colors.text,
  },
  text: {
    fontFamily: Fonts.bodySemibold,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.background,
    letterSpacing: 0.3,
  },
});
