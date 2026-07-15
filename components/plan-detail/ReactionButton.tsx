import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Colors, FontSize, Radius } from '../../lib/theme';

const ReactionButton = React.memo(function ReactionButton({
  emoji, count, reacted, onPress,
}: {
  emoji: string; count: number; reacted: boolean; onPress: (emoji: string) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.reactionBtn, reacted && styles.reactionBtnActive]}
      onPress={() => onPress(emoji)}
      accessibilityRole="button"
      accessibilityLabel={`React ${emoji}${count > 0 ? `, ${count}` : ''}`}
      accessibilityState={{ selected: reacted }}
    >
      <Text style={styles.reactionEmoji}>{emoji}</Text>
      {count > 0 && <Text style={[styles.reactionCount, reacted && styles.reactionCountActive]}>{count}</Text>}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  reactionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.md, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  reactionBtnActive: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  reactionCountActive: { color: Colors.primary },
});

export default ReactionButton;
