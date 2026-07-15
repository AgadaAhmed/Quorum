import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize } from '../../lib/theme';
import { ChecklistItem, HIT_SLOP } from './shared';

const ChecklistRow = React.memo(function ChecklistRow({
  item, isLast, completerName, canDelete, onToggle, onDelete,
}: {
  item: ChecklistItem & { id: string };
  isLast: boolean;
  completerName: string | null;
  canDelete: boolean;
  onToggle: (id: string, completedBy: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const isDone = !!item.completedBy;
  return (
    <TouchableOpacity
      style={[styles.checklistItem, isLast && styles.noBorderBottom]}
      onPress={() => onToggle(item.id, item.completedBy)}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isDone }}
      accessibilityLabel={item.text}
    >
      <View style={[styles.checklistCircle, isDone && styles.checklistCircleDone]}>
        {isDone && <Ionicons name="checkmark" size={12} color={Colors.background} />}
      </View>
      <View style={styles.flex1}>
        <Text style={[styles.checklistItemText, isDone && styles.checklistItemTextDone]}>{item.text}</Text>
        {isDone && completerName && <Text style={styles.checklistCompletedBy}>Done by {completerName}</Text>}
      </View>
      {canDelete && (
        <TouchableOpacity
          onPress={() => onDelete(item.id)}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Delete checklist item"
        >
          <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  noBorderBottom: { borderBottomWidth: 0 },
  checklistItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '55',
  },
  checklistCircle: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checklistCircleDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  checklistItemText: { fontSize: FontSize.md, color: Colors.text, fontWeight: '500' },
  checklistItemTextDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  checklistCompletedBy: { fontSize: FontSize.xs, color: Colors.success, marginTop: 2, fontWeight: '600' },
});

export default ChecklistRow;
