import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';
import { HIT_SLOP } from './shared';

export const Label = React.memo(function Label({ text, first }: { text: string; first?: boolean }) {
  return <Text style={[styles.label, first && styles.labelFirst]}>{text}</Text>;
});

export const SectionHeading = React.memo(function SectionHeading({ text, first }: { text: string; first?: boolean }) {
  return (
    <View style={[styles.sectionHeading, first && styles.sectionHeadingFirst]}>
      <Text style={styles.sectionHeadingText}>{text}</Text>
      <View style={styles.sectionHeadingRule} />
    </View>
  );
});

export const PickerModal = React.memo(function PickerModal({
  visible,
  onCancel,
  onDone,
  children,
}: {
  visible: boolean;
  onCancel: () => void;
  onDone: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.dateModalOverlay}>
        <View style={styles.dateModalContent}>
          <View style={styles.dateModalHeader}>
            <TouchableOpacity onPress={onCancel} activeOpacity={0.7} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.dateModalCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDone} activeOpacity={0.7} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={styles.dateModalDone}>Done</Text>
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  labelFirst: { marginTop: 0 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  sectionHeadingFirst: { marginTop: Spacing.xs },
  sectionHeadingText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.black,
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  sectionHeadingRule: { flex: 1, height: 1, backgroundColor: Colors.border },
  dateModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  dateModalContent: {
    backgroundColor: Colors.surfaceRaised,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: 30,
  },
  dateModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dateModalCancel: { color: Colors.textSecondary, fontSize: FontSize.md, paddingVertical: 4 },
  dateModalDone: { color: Colors.primary, fontSize: FontSize.md, fontWeight: FontWeight.bold, paddingVertical: 4 },
});
