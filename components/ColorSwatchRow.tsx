import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../lib/theme';
import { PROFILE_COLORS } from '../lib/profileCustomization';

type Props = {
  selectedKey?: string;
  onSelect: (key: string | undefined) => void;
};

const SIZE = 34;

export default function ColorSwatchRow({ selectedKey, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <TouchableOpacity
        testID="swatch-none"
        onPress={() => onSelect(undefined)}
        style={[styles.swatch, styles.none, !selectedKey && styles.selected]}
        accessibilityLabel="No color"
      >
        <Ionicons name="ban-outline" size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {PROFILE_COLORS.map((c) => {
        // Read into a local first: `c.value` accessed directly inside a JSX
        // style prop is misidentified by the reanimated Babel plugin as a
        // shared-value read (its `.value` idiom) and gets instrumented,
        // pulling in the worklets runtime — which isn't initialized under
        // Jest. Hoisting the read avoids tripping that heuristic.
        const swatchColor = c.value;
        return (
          <TouchableOpacity
            key={c.key}
            testID={`swatch-${c.key}`}
            onPress={() => onSelect(c.key)}
            style={[
              styles.swatch,
              { backgroundColor: swatchColor },
              selectedKey === c.key && styles.selected,
            ]}
            accessibilityLabel={c.label}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  swatch: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  none: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.textMuted },
  selected: { borderWidth: 3, borderColor: Colors.text },
});
