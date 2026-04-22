import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

const PARTICLE_COUNT = 28;
const COLORS = ['#f43f5e', '#fb7185', '#FFD700', '#ffffff', '#4ade80', '#fb923c', '#c084fc', '#38bdf8'];

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

  const fire = () => {
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

      Animated.parallel([
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
      ]).start();
    });
  };

  useImperativeHandle(ref, () => ({ fire }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.center}>
        {particles.map((p, i) => {
          const rotate = p.rotate.interpolate({
            inputRange: [-2, 2],
            outputRange: ['-720deg', '720deg'],
          });
          return (
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
                  transform: [{ translateX: p.tx }, { translateY: p.ty }, { rotate }],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
});

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
