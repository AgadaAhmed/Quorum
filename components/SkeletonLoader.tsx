import React, { memo, useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '../lib/theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonItemBase({ width = '100%', height = 16, borderRadius = Radius.sm, style }: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      })
    );
    loop.start();
    // Stop the loop on unmount to avoid leaking the animation.
    return () => loop.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-250, 350],
  });

  return (
    <View style={[styles.skeletonBase, { width, height, borderRadius }, style]}>
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.shimmerStrip, { transform: [{ translateX }] }]}
      />
    </View>
  );
}

export const SkeletonItem = memo(SkeletonItemBase);

function SkeletonCardBase() {
  return (
    <View style={styles.card}>
      <SkeletonItem width="60%" height={14} style={styles.mb10} />
      <SkeletonItem width="90%" height={10} style={styles.mb6} />
      <SkeletonItem width="75%" height={10} style={styles.mb14} />
      <SkeletonItem width="100%" height={6} borderRadius={3} />
    </View>
  );
}

const SkeletonCard = memo(SkeletonCardBase);
export default SkeletonCard;

function SkeletonChatBubbleBase({ own = false }: { own?: boolean }) {
  return (
    <View style={[styles.chatBubbleRow, own ? styles.chatBubbleOwn : styles.chatBubbleOther]}>
      {!own && <SkeletonItem width={30} height={30} borderRadius={15} style={styles.noShrink} />}
      <View style={styles.chatBubbleBody}>
        {!own && <SkeletonItem width="40%" height={9} />}
        <SkeletonItem width="100%" height={38} borderRadius={14} />
      </View>
    </View>
  );
}

export const SkeletonChatBubble = memo(SkeletonChatBubbleBase);

function SkeletonActivityItemBase() {
  return (
    <View style={styles.activityItem}>
      <SkeletonItem width={44} height={44} borderRadius={22} style={styles.noShrink} />
      <View style={styles.activityBody}>
        <SkeletonItem width="55%" height={13} />
        <SkeletonItem width="80%" height={10} />
      </View>
      <SkeletonItem width={36} height={10} />
    </View>
  );
}

export const SkeletonActivityItem = memo(SkeletonActivityItemBase);

function SkeletonProfileBase() {
  return (
    <View style={styles.profileSkeleton}>
      <View style={styles.profileHeader}>
        <SkeletonItem width={90} height={90} borderRadius={45} />
        <SkeletonItem width={140} height={18} />
        <SkeletonItem width={90} height={12} />
      </View>
      <View style={styles.card}>
        <SkeletonItem width="30%" height={12} style={styles.mb10} />
        <SkeletonItem width="100%" height={10} style={styles.mb6} />
        <SkeletonItem width="80%" height={10} />
      </View>
      <View style={[styles.card, styles.statsRow]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.statCell}>
            <SkeletonItem width={40} height={20} />
            <SkeletonItem width={50} height={10} />
          </View>
        ))}
      </View>
    </View>
  );
}

export const SkeletonProfile = memo(SkeletonProfileBase);

const styles = StyleSheet.create({
  skeletonBase: {
    backgroundColor: Colors.surfaceBright,
    overflow: 'hidden',
  },
  // Light highlight that sweeps across the grey placeholder.
  shimmerStrip: {
    width: 200,
    backgroundColor: Colors.glassHighlight,
  },
  card: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.lg,
    padding: Spacing.gutter,
    paddingLeft: Spacing.md + 2,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    borderLeftWidth: 4,
    borderLeftColor: Colors.borderStrong,
  },
  chatBubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  chatBubbleOwn: {
    justifyContent: 'flex-end',
  },
  chatBubbleOther: {
    justifyContent: 'flex-start',
  },
  chatBubbleBody: {
    flex: 1,
    maxWidth: '65%',
    gap: 6,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  activityBody: {
    flex: 1,
    gap: 6,
  },
  profileSkeleton: {
    padding: Spacing.md,
  },
  profileHeader: {
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statCell: {
    alignItems: 'center',
    gap: 6,
  },
  noShrink: { flexShrink: 0 },
  mb6: { marginBottom: 6 },
  mb10: { marginBottom: 10 },
  mb14: { marginBottom: 14 },
});
