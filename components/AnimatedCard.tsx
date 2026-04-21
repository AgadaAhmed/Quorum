import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Colors, Radius, Shadow } from '../lib/theme';

interface Props {
  children: React.ReactNode;
  index?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  accentColor?: string;
}

export default function AnimatedCard({ children, index = 0, onPress, onLongPress, style, accentColor }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 90, friction: 13, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.972, useNativeDriver: true, speed: 80, bounciness: 2 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 45, bounciness: 10 }).start();

  const accent = accentColor || Colors.primary;
  const isArchived = accentColor === Colors.textMuted;

  const content = (
    <Animated.View
      style={[
        styles.card,
        { borderColor: accent + '40' },
        isArchived && styles.cardArchived,
        style,
        { opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      <View style={[styles.topAccent, { backgroundColor: accent }]} />
      {children}
    </Animated.View>
  );

  if (onPress || onLongPress) {
    return (
      <TouchableOpacity activeOpacity={1} onPress={onPress} onLongPress={onLongPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    ...Shadow.dark,
  },
  cardArchived: { opacity: 0.55 },
  topAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
});
