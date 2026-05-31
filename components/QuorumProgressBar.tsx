import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius } from '../lib/theme';

interface Props {
  votes: number;
  required: number;
  label?: string;
}

export default function QuorumProgressBar({ votes, required, label }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const ratio = Math.min(votes / Math.max(required, 1), 1);
  const pct = Math.round(ratio * 100);
  const reached = votes >= required;
  const nearComplete = ratio >= 0.6;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: ratio,
      tension: 55,
      friction: 10,
      useNativeDriver: false,
    }).start();
  }, [ratio]);

  // Shimmer animation when near quorum
  useEffect(() => {
    if (nearComplete) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmer, { toValue: 1, duration: 1100, useNativeDriver: false }),
          Animated.timing(shimmer, { toValue: 0, duration: 1100, useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      shimmer.setValue(0);
    }
  }, [nearComplete]);

  const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] });

  const fillColors: [string, string] = reached
    ? [Colors.secondaryLight, Colors.secondary]   // Teal — confirmed
    : [Colors.primaryLight, Colors.primary];       // Dark — pending

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label ?? `${votes} / ${required} votes`}</Text>
        <Text style={[styles.pct, reached && styles.pctReached]}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        {/* Shimmer glow layer */}
        {nearComplete && (
          <Animated.View
            style={[
              styles.glowLayer,
              {
                opacity: shimmerOpacity,
                backgroundColor: reached ? Colors.secondary : Colors.primary,
              },
            ]}
          />
        )}
        <Animated.View
          style={{
            height: 6,
            borderRadius: 0,
            width: progress.interpolate({ inputRange: [0, 1], outputRange: ['2%', '100%'] }),
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={fillColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  pct: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.text },
  pctReached: { color: Colors.secondaryLight },
  track: {
    height: 6,
    borderRadius: 0,
    backgroundColor: Colors.surfaceBright,
    overflow: 'hidden',
    position: 'relative',
  },
  glowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
  },
});
