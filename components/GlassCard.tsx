import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Colors, Radius, Shadow } from '../lib/theme';

interface Props {
  children: React.ReactNode;
  index?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  /** Accent glow color applied as border + shadow tint */
  glowColor?: string;
  /** If true, skip entrance animation */
  noAnimate?: boolean;
}

/**
 * Core card primitive for the new UI.
 * Uses semi-transparent glass surface + subtle border + optional color glow.
 */
export default function GlassCard({
  children,
  index = 0,
  onPress,
  onLongPress,
  style,
  glowColor,
  noAnimate = false,
}: Props) {
  const opacity = useRef(new Animated.Value(noAnimate ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(noAnimate ? 0 : 24)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (noAnimate) return;
    // Cap delay so lists of 10+ cards don't feel sluggish (max 240ms stagger)
    const delay = Math.min(index * 60, 240);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        tension: 90,
        friction: 13,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.972, useNativeDriver: true, speed: 80, bounciness: 2 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 45, bounciness: 10 }).start();

  const borderColor = glowColor
    ? glowColor + '55'
    : Colors.glassBorder;

  const shadowStyle = glowColor
    ? { shadowColor: glowColor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 10 }
    : Shadow.dark;

  const inner = (
    <Animated.View
      style={[
        styles.card,
        { borderColor, ...shadowStyle },
        style,
        { opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      {/* Top highlight streak */}
      <View style={styles.topHighlight} />
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
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: Colors.glassHighlight,
    borderRadius: 1,
  },
});
