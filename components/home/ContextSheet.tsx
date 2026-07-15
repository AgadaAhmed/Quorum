import React from 'react';
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';
import { Plan } from './shared';

type ContextSheetProps = {
  plan: Plan | null;
  uid: string;
  translateY: Animated.Value;
  isPinned: boolean;
  isArchived: boolean;
  onClose: () => void;
  onView: (id: string) => void;
  onChat: (id: string, title: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (plan: Plan) => void;
  onLeave: (plan: Plan) => void;
};

export default function ContextSheet({
  plan,
  uid,
  translateY,
  isPinned,
  isArchived,
  onClose,
  onView,
  onChat,
  onPin,
  onUnpin,
  onArchive,
  onUnarchive,
  onDelete,
  onLeave,
}: ContextSheetProps) {
  return (
    <Modal visible={!!plan} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.contextOverlay} activeOpacity={1} onPress={onClose}>
        <Animated.View style={[styles.contextSheet, { transform: [{ translateY }] }]}>
          <View style={styles.contextHandle} />
          {plan && (
            <>
              <Text style={styles.contextTitle} numberOfLines={1}>
                {plan.title}
              </Text>
              <View style={styles.contextDivider} />

              <TouchableOpacity
                style={styles.contextRow}
                activeOpacity={0.6}
                onPress={() => {
                  onClose();
                  onView(plan.id);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="eye-outline" size={20} color={Colors.text} />
                <Text style={styles.contextLabel}>View Plan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contextRow}
                activeOpacity={0.6}
                onPress={() => {
                  onClose();
                  onChat(plan.id, plan.title);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="chatbubble-outline" size={20} color={Colors.text} />
                <Text style={styles.contextLabel}>Open Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contextRow}
                activeOpacity={0.6}
                onPress={() => {
                  onClose();
                  if (isPinned) onUnpin(plan.id);
                  else onPin(plan.id);
                }}
                accessibilityRole="button"
              >
                <Ionicons
                  name={isPinned ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color={Colors.text}
                />
                <Text style={styles.contextLabel}>{isPinned ? 'Unpin' : 'Pin to Top'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contextRow}
                activeOpacity={0.6}
                onPress={() => {
                  onClose();
                  if (isArchived) onUnarchive(plan.id);
                  else onArchive(plan.id);
                }}
                accessibilityRole="button"
              >
                <Ionicons
                  name={isArchived ? 'arrow-up-circle-outline' : 'archive-outline'}
                  size={20}
                  color={Colors.text}
                />
                <Text style={styles.contextLabel}>{isArchived ? 'Restore' : 'Archive'}</Text>
              </TouchableOpacity>

              <View style={styles.contextDivider} />

              {plan.createdBy === uid ? (
                <TouchableOpacity
                  style={styles.contextRow}
                  activeOpacity={0.6}
                  onPress={() => {
                    onClose();
                    onDelete(plan);
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  <Text style={[styles.contextLabel, styles.contextLabelStrong]}>Delete Plan</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.contextRow}
                  activeOpacity={0.6}
                  onPress={() => {
                    onClose();
                    onLeave(plan);
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="exit-outline" size={20} color={Colors.error} />
                  <Text style={[styles.contextLabel, styles.contextLabelStrong]}>Leave Plan</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  contextOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  contextSheet: {
    backgroundColor: Colors.surfaceOverlay,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: 12,
    paddingBottom: 36,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contextHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    alignSelf: 'center',
    marginBottom: 16,
  },
  contextTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: Colors.text,
    paddingHorizontal: 4,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  contextDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderStrong,
    marginVertical: Spacing.xs,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    minHeight: 48,
  },
  contextLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  contextLabelStrong: {
    color: Colors.error,
  },
});
