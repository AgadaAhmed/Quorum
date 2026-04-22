import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../lib/theme';

interface Props {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readonly?: boolean;
}

export default function StarRating({ value, onChange, size = 28, readonly = false }: Props) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => !readonly && onChange?.(star)}
          disabled={readonly}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Ionicons
            name={value >= star ? 'star' : 'star-outline'}
            size={size}
            color={value >= star ? Colors.gold : Colors.border}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
});
