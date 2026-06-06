import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius } from '../lib/theme';

interface Props {
  votes: number;
  required: number;
  label?: string;
}

function QuorumProgressBar({ votes, required, label }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  // Guard against NaN / negative / missing data.
  const safeVotes = Number.isFinite(votes) ? Math.max(0, votes) : 0;
  const safeRequired = Number.isFinite(required) ? Math.max(1, required) : 1;

  const ratio = Math.min(safeVotes / safeRequired, 1);
  const pct = Math.round(ratio * 100);
  const reached = safeVotes >= safeRequired;
  const nearComplete = ratio >= 0.6;

  useEffect(() => {
    const anim = Animated.spring(progress, {
      toValue: ratio,
      tension: 55,
      friction: 10,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [ratio, progress]);

  // Shimmer pulse when near quorum.
  useEffect(() => {
    if (!nearComplete) {
      shimmer.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1100, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 1100, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [nearComplete, shimmer]);

  const shimmerOpacity = useMemo(
    () => shimmer.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
    [shimmer]
  );

  const fillWidth = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: ['2%', '100%'] }),
    [progress]
  );

  // Reached = lighter grey, pending = near-black (distinguished by value, not hue).
  const fillColors: [string, string] = reached
    ? [Colors.secondaryLight, Colors.secondary]
    : [Colors.primaryLight, Colors.primary];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>
          {label ?? `${safeVotes} / ${safeRequired} votes`}
        </Text>
        <Text
          style={[styles.pct, reached && styles.pctReached]}
          accessibilityLabel={`${pct} percent of quorum`}
        >
          {pct}%
        </Text>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        {nearComplete && (
          <Animated.View
            style={[
              styles.glowLayer,
              { opacity: shimmerOpacity, backgroundColor: reached ? Colors.secondary : Colors.primary },
            ]}
          />
        )}
        <Animated.View style={[styles.fill, { width: fillWidth }]}>
          <LinearGradient
            colors={fillColors}
            start={GRADIENT_START}
            end={GRADIENT_END}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 1, y: 0 };

const styles = StyleSheet.create({
  container: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { flexShrink: 1, fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  pct: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.text },
  pctReached: { color: Colors.secondaryLight },
  track: {
    height: 6,
    borderRadius: Radius.xs,
    backgroundColor: Colors.surfaceBright,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: 6,
    borderRadius: Radius.xs,
    overflow: 'hidden',
  },
  glowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.xs,
  },
});

export default memo(QuorumProgressBar);
