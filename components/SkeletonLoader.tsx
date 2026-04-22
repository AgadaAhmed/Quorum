import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '../lib/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonItem({ width = '100%', height = 16, borderRadius = Radius.sm, style }: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-250, 350],
  });

  return (
    <View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: Colors.surface, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          styles.shimmerStrip,
          { transform: [{ translateX }] },
        ]}
      />
    </View>
  );
}

export default function SkeletonCard() {
  return (
    <View style={styles.card}>
      <SkeletonItem width="60%" height={14} style={{ marginBottom: 10 }} />
      <SkeletonItem width="90%" height={10} style={{ marginBottom: 6 }} />
      <SkeletonItem width="75%" height={10} style={{ marginBottom: 14 }} />
      <SkeletonItem width="100%" height={6} borderRadius={3} />
    </View>
  );
}

export function SkeletonChatBubble({ own = false }: { own?: boolean }) {
  return (
    <View style={[styles.chatBubbleRow, own ? styles.chatBubbleOwn : styles.chatBubbleOther]}>
      {!own && <SkeletonItem width={30} height={30} borderRadius={15} style={{ flexShrink: 0 }} />}
      <View style={{ flex: 1, maxWidth: '65%', gap: 6 }}>
        {!own && <SkeletonItem width="40%" height={9} />}
        <SkeletonItem width="100%" height={38} borderRadius={14} />
      </View>
    </View>
  );
}

export function SkeletonActivityItem() {
  return (
    <View style={styles.activityItem}>
      <SkeletonItem width={44} height={44} borderRadius={22} style={{ flexShrink: 0 }} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonItem width="55%" height={13} />
        <SkeletonItem width="80%" height={10} />
      </View>
      <SkeletonItem width={36} height={10} />
    </View>
  );
}

export function SkeletonProfile() {
  return (
    <View style={styles.profileSkeleton}>
      <View style={{ alignItems: 'center', gap: 10, marginBottom: Spacing.lg }}>
        <SkeletonItem width={90} height={90} borderRadius={45} />
        <SkeletonItem width={140} height={18} />
        <SkeletonItem width={90} height={12} />
      </View>
      <View style={styles.card}>
        <SkeletonItem width="30%" height={12} style={{ marginBottom: 10 }} />
        <SkeletonItem width="100%" height={10} style={{ marginBottom: 6 }} />
        <SkeletonItem width="80%" height={10} />
      </View>
      <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-around' }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ alignItems: 'center', gap: 6 }}>
            <SkeletonItem width={40} height={20} />
            <SkeletonItem width={50} height={10} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shimmerStrip: {
    width: 200,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  card: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 20,
    padding: 16,
    paddingLeft: 22,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary + '44',
  },
  chatBubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  chatBubbleOwn: {
    justifyContent: 'flex-end',
  },
  chatBubbleOther: {
    justifyContent: 'flex-start',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  profileSkeleton: {
    padding: Spacing.md,
  },
});
