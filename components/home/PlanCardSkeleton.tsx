import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SkeletonItem } from '../SkeletonLoader';
import { Colors, Radius, Spacing } from '../../lib/theme';

// Plan card skeleton (matches the real card: cover + body + progress)
const PlanCardSkeleton = React.memo(function PlanCardSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <SkeletonItem width="100%" height={180} borderRadius={0} />
      <View style={styles.skeletonBody}>
        <SkeletonItem width="35%" height={9} />
        <SkeletonItem width="80%" height={20} style={styles.skeletonGapSm} />
        <View style={styles.skeletonMetaRow}>
          <SkeletonItem width={72} height={11} />
          <SkeletonItem width={96} height={11} />
        </View>
        <SkeletonItem width="100%" height={6} borderRadius={3} style={styles.skeletonGapMd} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  skeletonCard: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  skeletonBody: {
    padding: Spacing.md,
    gap: 8,
  },
  skeletonMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  skeletonGapSm: { marginTop: 4 },
  skeletonGapMd: { marginTop: 8 },
});

export default PlanCardSkeleton;
