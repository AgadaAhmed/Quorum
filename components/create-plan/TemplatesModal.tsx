import React, { useCallback } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';
import { HIT_SLOP, Template } from './shared';

const TemplateRow = React.memo(function TemplateRow({
  item,
  onApply,
  onDelete,
}: {
  item: Template;
  onApply: (t: Template) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.templateItem}
      onPress={() => onApply(item)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Use template ${item.name || 'Untitled'}`}
    >
      <View style={styles.flex}>
        <Text style={styles.templateItemTitle}>{item.name || 'Untitled'}</Text>
        {item.description ? (
          <Text style={styles.templateItemDesc} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.templateTagRow}>
          {item.category ? <Text style={styles.templateTag}>{item.category}</Text> : null}
          <Text style={styles.templateTag}>{item.requiredVotes ?? 3} votes</Text>
          {item.isPublic ? <Text style={styles.templateTag}>Public</Text> : null}
        </View>
      </View>
      <TouchableOpacity
        onPress={() => onDelete(item.id)}
        hitSlop={HIT_SLOP}
        activeOpacity={0.7}
        style={styles.templateDeleteBtn}
        accessibilityRole="button"
        accessibilityLabel={`Delete template ${item.name || 'Untitled'}`}
      >
        <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

export default function TemplatesModal({
  visible,
  templates,
  onClose,
  onApply,
  onDelete,
}: {
  visible: boolean;
  templates: Template[];
  onClose: () => void;
  onApply: (t: Template) => void;
  onDelete: (id: string) => void;
}) {
  const renderTemplate = useCallback(
    ({ item }: { item: Template }) => (
      <TemplateRow item={item} onApply={onApply} onDelete={onDelete} />
    ),
    [onApply, onDelete]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.templateModalOverlay}>
        <View style={styles.templateModalContent}>
          <View style={styles.templateModalHeader}>
            <Text style={styles.templateModalTitle}>My Templates</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={HIT_SLOP}
              activeOpacity={0.7}
              style={styles.modalCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Close templates"
            >
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          {templates.length === 0 ? (
            <View style={styles.templateEmptyState}>
              <Ionicons name="bookmark-outline" size={28} color={Colors.textMuted} style={styles.mb6} />
              <Text style={styles.templateEmptyTitle}>No templates yet</Text>
              <Text style={styles.templateEmpty}>
                Save a plan as a template to reuse its details next time.
              </Text>
            </View>
          ) : (
            <FlatList
              data={templates}
              keyExtractor={(t) => t.id}
              contentContainerStyle={styles.templateList}
              renderItem={renderTemplate}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mb6: { marginBottom: 6 },
  templateModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  templateModalContent: {
    backgroundColor: Colors.surfaceRaised,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '70%',
  },
  templateModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  templateModalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.text },
  modalCloseBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  templateEmptyState: { alignItems: 'center', paddingVertical: Spacing.lg, paddingHorizontal: Spacing.md },
  templateEmptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 4 },
  templateEmpty: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  templateList: { gap: 8, paddingBottom: Spacing.md },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  templateItemTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  templateItemDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  templateTagRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  templateTag: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    backgroundColor: Colors.primaryDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  templateDeleteBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
});
