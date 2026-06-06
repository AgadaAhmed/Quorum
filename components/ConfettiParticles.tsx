import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Colors } from '../lib/theme';

const PARTICLE_COUNT = 28;

// Monochrome confetti — blacks, greys and white only (no hue).
const COLORS = [
  Colors.primary, // #000000
  Colors.secondary, // dark grey
  Colors.textSecondary,
  Colors.textMuted,
  Colors.gold, // mid grey
  Colors.goldLight,
  Colors.surfaceBright,
  '#ffffff',
] as const;

type Particle = {
  tx: Animated.Value;
  ty: Animated.Value;
  opacity: Animated.Value;
  rotate: Animated.Value;
  color: string;
  size: number;
  shape: 'circle' | 'square';
};

export type ConfettiRef = { fire: () => void };

const ConfettiParticles = forwardRef<ConfettiRef>((_, ref) => {
  const particles = useRef<Particle[]>(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      tx: new Animated.Value(0),
      ty: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 5 + Math.floor(Math.random() * 7),
      shape: Math.random() > 0.5 ? 'circle' : 'square',
    }))
  ).current;

  // Track in-flight animations so we can stop them on unmount.
  const running = useRef<Animated.CompositeAnimation[]>([]);

  const fire = useCallback(() => {
    // Cancel anything still animating before re-firing.
    running.current.forEach((a) => a.stop());
    running.current = [];

    particles.forEach((p) => {
      p.tx.setValue(0);
      p.ty.setValue(0);
      p.opacity.setValue(1);
      p.rotate.setValue(0);

      const angle = Math.random() * Math.PI * 2;
      const distance = 90 + Math.random() * 160;
      const finalX = Math.cos(angle) * distance;
      // Bias upward
      const finalY = Math.sin(angle) * distance - 80;
      const duration = 600 + Math.random() * 300;

      const anim = Animated.parallel([
        Animated.timing(p.tx, { toValue: finalX, duration, useNativeDriver: true }),
        Animated.timing(p.ty, { toValue: finalY, duration, useNativeDriver: true }),
        Animated.timing(p.rotate, {
          toValue: Math.random() > 0.5 ? 2 : -2,
          duration,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(duration * 0.5),
          Animated.timing(p.opacity, { toValue: 0, duration: duration * 0.5, useNativeDriver: true }),
        ]),
      ]);
      running.current.push(anim);
      anim.start();
    });
  }, [particles]);

  useImperativeHandle(ref, () => ({ fire }), [fire]);

  // Stop all animations when the component unmounts.
  useEffect(() => {
    return () => {
      running.current.forEach((a) => a.stop());
      running.current = [];
    };
  }, []);

  // Pre-compute the rotate interpolations once per particle.
  const rotations = useMemo(
    () =>
      particles.map((p) =>
        p.rotate.interpolate({
          inputRange: [-2, 2],
          outputRange: ['-720deg', '720deg'],
        })
      ),
    [particles]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.center}>
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                width: p.size,
                height: p.size,
                borderRadius: p.shape === 'circle' ? p.size / 2 : 2,
                backgroundColor: p.color,
                opacity: p.opacity,
                transform: [{ translateX: p.tx }, { translateY: p.ty }, { rotate: rotations[i] }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
});

ConfettiParticles.displayName = 'ConfettiParticles';

export default ConfettiParticles;

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
});
