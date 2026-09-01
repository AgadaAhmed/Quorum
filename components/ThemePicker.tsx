import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palettes, THEME_META, type ThemeName, type ThemePalette } from '../lib/theme';
import { useTheme, useThemeControls, useThemedStyles } from '../lib/ThemeContext';
import { useSubscription } from '../hooks/useSubscription';
import { FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

/**
 * Horizontal row of theme swatches. Each swatch previews the theme using that
 * theme's OWN palette. Pro-locked themes show a lock and call `onLockedPress`
 * (open the paywall) instead of applying, for free users.
 */
export default function ThemePicker({ onLockedPress }: { onLockedPress: () => void }) {
  const Colors = useTheme();
  const { name, setTheme } = useThemeControls();
  const { isPro } = useSubscription();
  const styles = useThemedStyles(makeStyles);
  const names = Object.keys(palettes) as ThemeName[];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {names.map((n) => {
        const p = palettes[n];
        const meta = THEME_META[n];
        const locked = meta.pro && !isPro;
        const selected = n === name;
        return (
          <TouchableOpacity
            key={n}
            activeOpacity={0.8}
            onPress={() => (locked ? onLockedPress() : setTheme(n))}
            accessibilityRole="button"
            accessibilityLabel={`${meta.label} theme${locked ? ', Pro' : ''}${selected ? ', selected' : ''}`}
            style={styles.item}
          >
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: p.background,
                  borderColor: selected ? Colors.primary : Colors.border,
                  borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={[styles.bar, { backgroundColor: p.surfaceRaised }]} />
              <View style={[styles.line, { backgroundColor: p.text }]} />
              <View style={[styles.lineShort, { backgroundColor: p.textMuted }]} />
              <View style={[styles.dot, { backgroundColor: p.primary }]} />
              {selected && (
                <View style={[styles.badge, { backgroundColor: p.primary }]}>
                  <Ionicons name="checkmark" size={12} color={p.background} />
                </View>
              )}
              {locked && (
                <View style={[styles.badge, styles.lockBadge, { backgroundColor: p.surfaceRaised }]}>
                  <Ionicons name="lock-closed" size={11} color={p.text} />
                </View>
              )}
            </View>
            <Text style={[styles.label, selected && styles.labelSelected]}>{meta.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (Colors: ThemePalette) =>
  StyleSheet.create({
    row: { gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs },
    item: { alignItems: 'center', gap: 6, width: 84 },
    swatch: {
      width: 84,
      height: 64,
      borderRadius: Radius.md,
      padding: 8,
      justifyContent: 'flex-start',
      overflow: 'hidden',
    },
    bar: { height: 8, borderRadius: 2, width: '70%' },
    line: { height: 5, borderRadius: 2, width: '85%', marginTop: 8 },
    lineShort: { height: 5, borderRadius: 2, width: '50%', marginTop: 5 },
    dot: { position: 'absolute', bottom: 8, right: 8, width: 14, height: 14, borderRadius: 7 },
    badge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lockBadge: { borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
    label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
    labelSelected: { color: Colors.text, fontWeight: FontWeight.bold },
  });
