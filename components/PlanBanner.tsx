import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export type PlanBannerVariant = 'hero' | 'card' | 'thumb';

// Category -> Ionicon (vector glyphs, NOT emoji).
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Music: 'musical-notes',
  Food: 'restaurant',
  Sports: 'basketball',
  Art: 'color-palette',
  Gaming: 'game-controller',
  Travel: 'airplane',
  Party: 'sparkles',
  Study: 'book',
};
const DEFAULT_ICON: keyof typeof Ionicons.glyphMap = 'calendar';

// Dark monochrome gradient (theme tokens: primary #000 -> primaryContainer #1b1b1b -> tertiary #1a1a1a).
const GRADIENT = ['#000000', '#1b1b1b', '#1a1a1a'] as const;

const PLACEMENTS = [
  { dx: 0, dy: 0, rotate: '0deg' },
  { dx: 14, dy: -8, rotate: '-8deg' },
  { dx: -16, dy: 10, rotate: '7deg' },
  { dx: 10, dy: 12, rotate: '11deg' },
  { dx: -12, dy: -12, rotate: '-6deg' },
  { dx: 18, dy: 6, rotate: '5deg' },
] as const;

const VARIANT: Record<
  PlanBannerVariant,
  { height: ViewStyle['height']; icon: number; opacity: number; gradient: boolean }
> = {
  hero: { height: 220, icon: 104, opacity: 0.18, gradient: true },
  card: { height: 176, icon: 84, opacity: 0.2, gradient: true },
  thumb: { height: '100%', icon: 24, opacity: 0.6, gradient: false },
};

// djb2 string hash -> non-negative int. Exported for tests.
export function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (((h << 5) + h) + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface PlanBannerProps {
  category?: string;
  seed: string;
  variant: PlanBannerVariant;
  style?: StyleProp<ViewStyle>;
}

export default function PlanBanner({ category, seed, variant, style }: PlanBannerProps) {
  const cfg = VARIANT[variant];
  const iconName = (category && CATEGORY_ICONS[category]) || DEFAULT_ICON;
  const place = PLACEMENTS[hashSeed(seed) % PLACEMENTS.length];

  return (
    <View
      testID="plan-banner"
      accessible
      accessibilityLabel={`${category ?? 'Plan'} cover`}
      style={[styles.base, { height: cfg.height }, style]}
    >
      {cfg.gradient ? (
        <LinearGradient
          colors={GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.flat]} />
      )}
      <View style={styles.center} pointerEvents="none">
        <Ionicons
          name={iconName}
          size={cfg.icon}
          color="#ffffff"
          style={{
            opacity: cfg.opacity,
            transform: [
              { translateX: place.dx },
              { translateY: place.dy },
              { rotate: place.rotate },
            ],
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { width: '100%', overflow: 'hidden', backgroundColor: '#141414' },
  flat: { backgroundColor: '#1a1a1a' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
