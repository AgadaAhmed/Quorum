import React, { memo, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../lib/theme';

interface Props {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readonly?: boolean;
}

const STARS = [1, 2, 3, 4, 5] as const;

function StarRating({ value, onChange, size = 28, readonly = false }: Props) {
  const handlePress = useCallback(
    (star: number) => {
      if (!readonly) onChange?.(star);
    },
    [readonly, onChange]
  );

  return (
    <View
      style={styles.row}
      accessibilityRole={readonly ? 'image' : 'adjustable'}
      accessibilityLabel={`Rating: ${value} out of 5 stars`}
    >
      {STARS.map((star) => {
        const filled = value >= star;
        return (
          <TouchableOpacity
            key={star}
            onPress={() => handlePress(star)}
            disabled={readonly}
            activeOpacity={0.7}
            hitSlop={hitSlop}
            accessibilityRole={readonly ? undefined : 'button'}
            accessibilityLabel={readonly ? undefined : `Rate ${star} ${star === 1 ? 'star' : 'stars'}`}
          >
            <Ionicons
              name={filled ? 'star' : 'star-outline'}
              size={size}
              color={filled ? Colors.text : Colors.textDisabled}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Min 44px touch target without enlarging the visual icon.
const hitSlop = { top: 8, bottom: 8, left: 6, right: 6 };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.xs },
});

export default memo(StarRating);
