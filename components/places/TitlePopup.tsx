import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/ThemeContext';
import { titleForTime, TIME_TITLE_PARTS } from '../../lib/places';

interface Props {
  visible: boolean;
  venueName: string;
  when: Date;
  onConfirm: (title: string) => void;
  onClose: () => void;
}

export default function TitlePopup({ visible, venueName, when, onConfirm, onClose }: Props) {
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);

  const candidates = useMemo(
    () => TIME_TITLE_PARTS.map((part) => `${part} at ${venueName}`),
    [venueName]
  );

  const [selected, setSelected] = useState(() => titleForTime(venueName, when));

  const handleConfirm = useCallback(() => {
    onConfirm(selected.trim() || venueName);
  }, [onConfirm, selected, venueName]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Name this plan</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.chipRow}>
            {candidates.map((candidate) => {
              const active = candidate === selected;
              return (
                <TouchableOpacity
                  key={candidate}
                  onPress={() => setSelected(candidate)}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                    {candidate}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={styles.input}
            value={selected}
            onChangeText={setSelected}
            placeholder="Custom title"
            placeholderTextColor={Colors.textMuted}
            accessibilityLabel="Plan title"
          />

          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={handleConfirm}
            accessibilityRole="button"
            accessibilityLabel="Start planning"
          >
            <Text style={styles.confirmBtnText}>Start planning</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (Colors: ThemePalette) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: Colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.md,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: Colors.surfaceRaised,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: Spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    title: {
      fontSize: FontSize.lg,
      fontWeight: FontWeight.bold,
      color: Colors.text,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
      marginBottom: Spacing.sm,
    },
    chip: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 8,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    chipActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    chipLabel: {
      fontSize: FontSize.sm,
      fontWeight: FontWeight.medium,
      color: Colors.text,
    },
    chipLabelActive: {
      color: Colors.background,
    },
    input: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 10,
      fontSize: FontSize.md,
      color: Colors.text,
      backgroundColor: Colors.surface,
      marginBottom: Spacing.sm,
    },
    confirmBtn: {
      backgroundColor: Colors.primary,
      borderRadius: Radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    confirmBtnText: {
      fontSize: FontSize.md,
      fontWeight: FontWeight.semibold,
      color: Colors.background,
    },
  });
