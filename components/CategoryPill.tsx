import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../lib/theme';
import { useThemedStyles } from '../lib/ThemeContext';

interface Pill {
  label: string;
  value: string;
}

interface Props {
  pills: Pill[];
  selected: string;
  onSelect: (value: string) => void;
}

interface PillItemProps {
  pill: Pill;
  active: boolean;
  onSelect: (value: string) => void;
}

const PillItem = React.memo(function PillItem({ pill, active, onSelect }: PillItemProps) {
  const styles = useThemedStyles(makeStyles);
  const handlePress = useCallback(() => onSelect(pill.value), [onSelect, pill.value]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.pill, active && styles.pillActive]}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={pill.label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{pill.label}</Text>
    </TouchableOpacity>
  );
});

function CategoryPillRow({ pills, selected, onSelect }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {pills.map((p) => (
        <PillItem key={p.value} pill={p} active={p.value === selected} onSelect={onSelect} />
      ))}
    </ScrollView>
  );
}

export default React.memo(CategoryPillRow);

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.container,
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  pill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
  },
  labelActive: {
    color: Colors.background,
  },
});
