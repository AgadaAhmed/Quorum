import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

interface Props {
  votes: number;
  required: number;
  label?: string;
}

export default function QuorumProgressBar({ votes, required, label }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const ratio = Math.min(votes / Math.max(required, 1), 1);
  const pct = Math.round(ratio * 100);
  const reached = votes >= required;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: ratio,
      tension: 60,
      friction: 10,
      useNativeDriver: false,
    }).start();
  }, [ratio]);

  useEffect(() => {
    if (ratio >= 0.6) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(glow, { toValue: 0.4, duration: 900, useNativeDriver: false }),
        ])
      ).start();
    } else {
      glow.setValue(0);
    }
  }, [ratio >= 0.6]);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label ?? `${votes} / ${required} votes`}</Text>
        <Text style={[styles.pct, reached && styles.pctReached]}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.glowLayer, { opacity: glowOpacity }]} />
        <Animated.View
          style={{
            height: 12,
            borderRadius: Radius.full,
            width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={reached ? ['#FFE55C', '#FFD700'] : ['#fb7185', '#f43f5e']}
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
  container: { gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  pct: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
  pctReached: { color: Colors.gold },
  track: {
    height: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  glowLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
});
