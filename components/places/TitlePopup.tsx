import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/ThemeContext';
import { titleForTime, TIME_TITLE_PARTS, type PlaceReview } from '../../lib/places';

interface Props {
  visible: boolean;
  venueName: string;
  when: Date;
  onConfirm: (title: string) => void;
  onClose: () => void;
  rating?: number | null;
  reviewCount?: number | null;
  reviews?: PlaceReview[];
}

/** Five-star row; fills whole/half/empty stars from a 0–5 rating. */
function StarRow({ rating, color, muted }: { rating: number; color: string; muted: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const name = rating >= i + 1 ? 'star' : rating >= i + 0.5 ? 'star-half' : 'star-outline';
        return <Ionicons key={i} name={name} size={14} color={rating > i ? color : muted} />;
      })}
    </View>
  );
}

export default function TitlePopup({
  visible,
  venueName,
  when,
  onConfirm,
  onClose,
  rating,
  reviewCount,
  reviews,
}: Props) {
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

          {typeof rating === 'number' ? (
            <View style={styles.ratingBlock}>
              <StarRow rating={rating} color={Colors.text} muted={Colors.textMuted} />
              <Text style={styles.ratingText}>
                {rating.toFixed(1)}
                {reviewCount ? ` · ${reviewCount} review${reviewCount === 1 ? '' : 's'}` : ''}
              </Text>
            </View>
          ) : null}

          {reviews && reviews.length > 0 ? (
            <View style={styles.reviews}>
              {reviews.slice(0, 2).map((r, i) => (
                <View key={i} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Text style={styles.reviewAuthor} numberOfLines={1}>
                      {r.author}
                    </Text>
                    {typeof r.rating === 'number' ? (
                      <StarRow rating={r.rating} color={Colors.text} muted={Colors.textMuted} />
                    ) : null}
                  </View>
                  {r.text ? (
                    <Text style={styles.reviewText} numberOfLines={3}>
                      {r.text}
                    </Text>
                  ) : null}
                  {r.relativeTime ? <Text style={styles.reviewTime}>{r.relativeTime}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}

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
    ratingBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      marginBottom: Spacing.sm,
    },
    ratingText: {
      fontSize: FontSize.sm,
      color: Colors.textSecondary,
      fontWeight: FontWeight.medium,
    },
    reviews: {
      gap: Spacing.xs,
      marginBottom: Spacing.sm,
    },
    review: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: Spacing.sm,
      gap: 4,
    },
    reviewHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.xs,
    },
    reviewAuthor: {
      flex: 1,
      fontSize: FontSize.sm,
      fontWeight: FontWeight.semibold,
      color: Colors.text,
    },
    reviewText: {
      fontSize: FontSize.sm,
      color: Colors.textSecondary,
      lineHeight: 18,
    },
    reviewTime: {
      fontSize: FontSize.xs,
      color: Colors.textMuted,
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
