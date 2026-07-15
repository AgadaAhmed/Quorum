import React, { useCallback, useRef } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import GlassCard from '../GlassCard';
import QuorumProgressBar from '../QuorumProgressBar';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';
import { getCountdown, Plan, quorumPercent } from './shared';

type SwipeCardProps = {
  item: Plan;
  index: number;
  uid: string;
  isArchived: boolean;
  isPinned: boolean;
  onPress: (id: string) => void;
  onLongPress: (plan: Plan) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (plan: Plan) => void;
  onLeave: (plan: Plan) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
};

const SwipeablePlanCard = React.memo(function SwipeablePlanCard({
  item,
  index,
  uid,
  isArchived,
  isPinned,
  onPress,
  onLongPress,
  onArchive,
  onUnarchive,
  onDelete,
  onLeave,
  onPin,
  onUnpin,
}: SwipeCardProps) {
  const swipeRef = useRef<Swipeable>(null);
  const isCreator = item.createdBy === uid;
  const countdown = getCountdown(item.dateTimestamp);
  const pct = quorumPercent(item);

  const runAndClose = useCallback((cb: () => void) => {
    swipeRef.current?.close();
    cb();
  }, []);

  const handlePress = useCallback(() => onPress(item.id), [onPress, item.id]);
  const handleLongPress = useCallback(() => onLongPress(item), [onLongPress, item]);

  const renderLeftActions = useCallback(
    () => (
      <View style={styles.swipeLeftActions}>
        {isPinned ? (
          <TouchableOpacity
            style={styles.swipeNeutralAction}
            activeOpacity={0.7}
            onPress={() => runAndClose(() => onUnpin(item.id))}
            accessibilityRole="button"
            accessibilityLabel="Unpin plan"
          >
            <Ionicons name="bookmark" size={20} color={Colors.text} />
            <Text style={styles.swipeActionText}>Unpin</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.swipeNeutralAction}
            activeOpacity={0.7}
            onPress={() => runAndClose(() => onPin(item.id))}
            accessibilityRole="button"
            accessibilityLabel="Pin plan"
          >
            <Ionicons name="bookmark-outline" size={20} color={Colors.text} />
            <Text style={styles.swipeActionText}>Pin</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [isPinned, runAndClose, onPin, onUnpin, item.id]
  );

  const renderRightActions = useCallback(
    () => (
      <View style={styles.swipeRightActions}>
        {isArchived ? (
          <TouchableOpacity
            style={[styles.swipeAction, styles.swipeActionSpaced]}
            activeOpacity={0.7}
            onPress={() => runAndClose(() => onUnarchive(item.id))}
            accessibilityRole="button"
            accessibilityLabel="Restore plan"
          >
            <Ionicons name="arrow-up-circle-outline" size={20} color={Colors.text} />
            <Text style={styles.swipeActionText}>Restore</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.swipeAction, styles.swipeActionSpaced]}
            activeOpacity={0.7}
            onPress={() => runAndClose(() => onArchive(item.id))}
            accessibilityRole="button"
            accessibilityLabel="Archive plan"
          >
            <Ionicons name="archive-outline" size={20} color={Colors.text} />
            <Text style={styles.swipeActionText}>Archive</Text>
          </TouchableOpacity>
        )}
        {isCreator ? (
          <TouchableOpacity
            style={[styles.swipeAction, styles.swipeActionStrong]}
            activeOpacity={0.85}
            onPress={() => runAndClose(() => onDelete(item))}
            accessibilityRole="button"
            accessibilityLabel="Delete plan"
          >
            <Ionicons name="trash-outline" size={20} color={Colors.background} />
            <Text style={[styles.swipeActionText, styles.swipeActionTextInverse]}>Delete</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.swipeAction}
            activeOpacity={0.7}
            onPress={() => runAndClose(() => onLeave(item))}
            accessibilityRole="button"
            accessibilityLabel="Leave plan"
          >
            <Ionicons name="exit-outline" size={20} color={Colors.text} />
            <Text style={styles.swipeActionText}>Leave</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [isArchived, isCreator, runAndClose, onArchive, onUnarchive, onDelete, onLeave, item]
  );

  const statusLabel = isArchived
    ? 'Archived'
    : item.status === 'confirmed'
    ? 'Confirmed'
    : 'Pending';
  const categoryLabel = isArchived
    ? 'ARCHIVED'
    : item.status === 'confirmed'
    ? 'CONFIRMED'
    : 'ACTIVE';

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      rightThreshold={40}
      leftThreshold={40}
      friction={2}
    >
      <GlassCard index={index} onPress={handlePress} onLongPress={handleLongPress}>
        {/* Cover image with overlays */}
        <View style={styles.coverWrap}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="image-outline" size={28} color={Colors.textDisabled} />
            </View>
          )}
          <View
            style={[
              styles.imageBadge,
              item.status === 'confirmed' && !isArchived
                ? styles.imageBadgeConfirmed
                : styles.imageBadgePending,
            ]}
          >
            <Text style={styles.imageBadgeText}>{statusLabel}</Text>
          </View>
          {countdown && (
            <View style={styles.countdownBadge}>
              <Ionicons name="time-outline" size={12} color={Colors.background} />
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          )}
          {isPinned && (
            <View style={styles.pinnedBadge}>
              <Ionicons name="bookmark" size={12} color={Colors.background} />
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardCategoryLabel}>
            {item.category ? `${item.category.toUpperCase()} • ` : ''}
            {categoryLabel}
          </Text>

          <Text style={styles.planTitle} numberOfLines={2}>
            {item.title}
          </Text>

          {(item.date || item.location) && (
            <View style={styles.metaRow}>
              {item.date ? (
                <View style={styles.metaChip}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
                  <Text style={[styles.metaText, styles.metaTextTabular]}>{item.date}</Text>
                </View>
              ) : null}
              {item.location ? (
                <View style={styles.metaChip}>
                  <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {item.location}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          <View style={styles.progressWrapper}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>Quorum Status</Text>
              <Text style={styles.progressPct}>{pct}%</Text>
            </View>
            <QuorumProgressBar votes={item.votes?.length || 0} required={item.requiredVotes || 3} />
          </View>

          <View style={styles.viewDetailsBtn}>
            <Text style={styles.viewDetailsBtnText}>
              {isCreator ? 'Manage Plan →' : 'View Details →'}
            </Text>
          </View>
        </View>
      </GlassCard>
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  // Plan card
  coverWrap: { position: 'relative' },
  coverImage: {
    width: '100%',
    height: 200,
    borderRadius: 0,
    backgroundColor: Colors.surfaceBright,
  },
  coverPlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.surfaceBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  imageBadgePending: {
    backgroundColor: Colors.overlay,
  },
  imageBadgeConfirmed: {
    backgroundColor: Colors.secondary,
  },
  imageBadgeText: {
    color: Colors.background,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  countdownBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.overlay,
  },
  countdownText: {
    color: Colors.background,
    fontSize: 12,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  pinnedBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 24,
    height: 24,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlay,
  },
  cardBody: {
    padding: Spacing.md,
    gap: 8,
  },
  cardCategoryLabel: {
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  planTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
  metaTextTabular: {
    fontVariant: ['tabular-nums'],
  },
  progressWrapper: {
    gap: 8,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  progressPct: {
    fontSize: 12,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  viewDetailsBtn: {
    alignSelf: 'flex-end',
    paddingTop: 4,
  },
  viewDetailsBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    letterSpacing: 0.2,
  },

  // Swipe actions
  swipeLeftActions: { flexDirection: 'row', marginVertical: 6 },
  swipeRightActions: { flexDirection: 'row', marginVertical: 6 },
  swipeNeutralAction: {
    backgroundColor: Colors.surfaceBright,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.md,
    gap: 4,
  },
  swipeAction: {
    backgroundColor: Colors.surfaceBright,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.md,
    gap: 4,
  },
  swipeActionSpaced: { marginRight: 4 },
  swipeActionStrong: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  swipeActionText: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  swipeActionTextInverse: {
    color: Colors.background,
  },
});

export default SwipeablePlanCard;
