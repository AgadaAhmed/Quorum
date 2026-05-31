import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'gold' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

export default function AnimatedButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  style,
  textStyle,
  disabled,
  loading,
  icon,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 80, bounciness: 3 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 55, bounciness: 12 }).start();

  const isDisabled = disabled || loading;

  const paddingV = size === 'sm' ? 10 : size === 'lg' ? 18 : 14;
  const paddingH = size === 'sm' ? 16 : size === 'lg' ? 28 : Spacing.lg;
  const fontSize = size === 'sm' ? FontSize.sm : size === 'lg' ? FontSize.lg : FontSize.md;

  const bgColor =
    variant === 'primary' ? Colors.primary :
    variant === 'gold'    ? Colors.gold :
    variant === 'danger'  ? Colors.tertiary :
    'transparent';

  const txtColor =
    variant === 'ghost'     ? Colors.primary :
    variant === 'secondary' ? Colors.text :
    '#ffffff';

  const borderColor =
    variant === 'ghost'     ? Colors.primaryBorder :
    variant === 'secondary' ? Colors.borderStrong :
    variant === 'danger'    ? Colors.tertiaryBorder :
    'transparent';

  const borderWidth =
    variant === 'ghost' || variant === 'secondary' || variant === 'danger' ? 1.5 : 0;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={isDisabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
    >
      <Animated.View
        style={[
          styles.button,
          {
            transform: [{ scale }],
            backgroundColor: bgColor,
            borderColor,
            borderWidth,
            paddingVertical: paddingV,
            paddingHorizontal: paddingH,
          },
          isDisabled && styles.disabled,
          style,
        ]}
      >
        <View style={styles.inner}>
          {loading ? (
            <ActivityIndicator size="small" color={txtColor} style={{ marginRight: 6 }} />
          ) : icon ? (
            <View style={{ marginRight: 6 }}>{icon}</View>
          ) : null}
          <Text style={[styles.label, { fontSize, color: txtColor, fontWeight: FontWeight.semibold }, textStyle]}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    letterSpacing: 0.3,
  },
  disabled: { opacity: 0.38 },
});
