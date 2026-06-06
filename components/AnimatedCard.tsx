import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '../lib/theme';

interface Props {
  children: React.ReactNode;
  index?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  /** Accent color for the top bar / border tint. Accepts a 6-digit hex (#rrggbb). */
  accentColor?: string;
  accessibilityLabel?: string;
}

/** Apply a fixed alpha to a 6-digit hex color. Falls back to the base color for unsupported formats. */
function withAlpha(hex: string, alphaHex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex + alphaHex;
  return hex;
}

function AnimatedCard({
  children,
  index = 0,
  onPress,
  onLongPress,
  style,
  accentColor,
  accessibilityLabel,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const delay = Math.min(index * 60, 240);
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 90, friction: 13, delay, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [index, opacity, translateY]);

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 80, bounciness: 2 }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 45, bounciness: 10 }).start();
  }, [scale]);

  const accent = accentColor || Colors.primary;
  const isArchived = accentColor === Colors.textMuted;

  const borderColor = useMemo(() => withAlpha(accent, '30'), [accent]);
  const accentStyle = useMemo(() => [styles.topAccent, { backgroundColor: accent }], [accent]);
  const animatedStyle = useMemo(
    () => ({ opacity, transform: [{ translateY }, { scale }] }),
    [opacity, translateY, scale],
  );

  const content = (
    <Animated.View
      style={[
        styles.card,
        { borderColor },
        isArchived && styles.cardArchived,
        style,
        animatedStyle,
      ]}
    >
      <View style={accentStyle} />
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
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

export default React.memo(AnimatedCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardArchived: { opacity: 0.55 },
  topAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
});
