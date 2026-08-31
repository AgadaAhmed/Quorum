import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../lib/theme';
import type { ConfettiRef } from '../components/ConfettiParticles';

/**
 * Reusable success celebration: a success haptic, an accent-tinted confetti
 * burst (if a confetti ref is passed), and an accent glow-pulse you can bind to
 * the triggering button via `glowStyle`.
 */
export function useCelebration() {
  const glow = useRef(new Animated.Value(0)).current;

  const glowStyle = {
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
    shadowRadius: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }),
    elevation: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }),
    transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
  };

  const celebrate = useCallback(
    (confettiRef?: React.RefObject<ConfettiRef | null>) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      confettiRef?.current?.fire({ accent: true });
      glow.stopAnimation();
      glow.setValue(0);
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 560, useNativeDriver: false }),
      ]).start();
    },
    [glow]
  );

  return { celebrate, glowStyle };
}
