import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';

interface Pill {
  label: string;
  value: string;
}

interface Props {
  pills: Pill[];
  selected: string;
  onSelect: (value: string) => void;
}

export default function CategoryPillRow({ pills, selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {pills.map((p) => {
        const active = p.value === selected;
        return (
          <TouchableOpacity
            key={p.value}
            onPress={() => onSelect(p.value)}
            style={[styles.pill, active && styles.pillActive]}
            activeOpacity={0.75}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{p.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  pillActive: {
    backgroundColor: Colors.primaryDim,
    borderColor: Colors.primaryBorder,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  labelActive: {
    color: Colors.primary,
  },
});
