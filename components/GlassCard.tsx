import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '../lib/theme';

interface Props {
  children: React.ReactNode;
  index?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  /** Border tint. Accepts a 6-digit hex (#rrggbb); ignored for other formats. */
  glowColor?: string;
  noAnimate?: boolean;
  accessibilityLabel?: string;
}

/** Apply a fixed alpha to a 6-digit hex color. Returns null for unsupported formats. */
function withAlpha(hex: string | undefined, alphaHex: string): string | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return hex + alphaHex;
}

function GlassCard({
  children,
  index = 0,
  onPress,
  onLongPress,
  style,
  glowColor,
  noAnimate = false,
  accessibilityLabel,
}: Props) {
  const opacity = useRef(new Animated.Value(noAnimate ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(noAnimate ? 0 : 16)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (noAnimate) return;
    const delay = Math.min(index * 55, 220);
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 100, friction: 14, delay, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [index, noAnimate, opacity, translateY]);

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 80, bounciness: 2 }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 12 }).start();
  }, [scale]);

  const borderColor = useMemo(() => withAlpha(glowColor, '40') ?? Colors.border, [glowColor]);

  const animatedStyle = useMemo(
    () => ({ opacity, transform: [{ translateY }, { scale }] }),
    [opacity, translateY, scale],
  );

  const inner = (
    <Animated.View style={[styles.card, { borderColor }, style, animatedStyle]}>
      {children}
    </Animated.View>
  );

  if (onPress || onLongPress) {
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

export default React.memo(GlassCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
});
