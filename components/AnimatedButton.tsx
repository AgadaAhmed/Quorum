import React, { useCallback, useMemo, useRef } from 'react';
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

type Variant = 'primary' | 'secondary' | 'gold' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
}

interface SizeSpec {
  paddingVertical: number;
  paddingHorizontal: number;
  fontSize: number;
}

interface VariantSpec {
  backgroundColor: string;
  color: string;
  borderColor: string;
  borderWidth: number;
}

const SIZE_SPECS: Record<Size, SizeSpec> = {
  sm: { paddingVertical: 10, paddingHorizontal: Spacing.gutter, fontSize: FontSize.sm },
  md: { paddingVertical: 14, paddingHorizontal: Spacing.lg, fontSize: FontSize.md },
  lg: { paddingVertical: 18, paddingHorizontal: 28, fontSize: FontSize.lg },
};

const VARIANT_SPECS: Record<Variant, VariantSpec> = {
  primary: { backgroundColor: Colors.primary, color: Colors.background, borderColor: 'transparent', borderWidth: 0 },
  gold: { backgroundColor: Colors.gold, color: Colors.background, borderColor: 'transparent', borderWidth: 0 },
  secondary: { backgroundColor: Colors.surfaceRaised, color: Colors.text, borderColor: Colors.borderStrong, borderWidth: 1.5 },
  ghost: { backgroundColor: 'transparent', color: Colors.primary, borderColor: Colors.primary, borderWidth: 1.5 },
  danger: { backgroundColor: Colors.tertiaryDim, color: Colors.tertiary, borderColor: Colors.tertiary, borderWidth: 1.5 },
};

function AnimatedButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  style,
  textStyle,
  disabled,
  loading,
  icon,
  accessibilityLabel,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 80, bounciness: 3 }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 55, bounciness: 12 }).start();
  }, [scale]);

  const isDisabled = Boolean(disabled || loading);

  const sizeSpec = SIZE_SPECS[size];
  const variantSpec = VARIANT_SPECS[variant];

  const containerStyle = useMemo(
    () => ({
      transform: [{ scale }],
      backgroundColor: variantSpec.backgroundColor,
      borderColor: variantSpec.borderColor,
      borderWidth: variantSpec.borderWidth,
      paddingVertical: sizeSpec.paddingVertical,
      paddingHorizontal: sizeSpec.paddingHorizontal,
    }),
    [scale, variantSpec, sizeSpec],
  );

  const labelStyle = useMemo(
    () => [styles.label, { fontSize: sizeSpec.fontSize, color: variantSpec.color }, textStyle],
    [sizeSpec.fontSize, variantSpec.color, textStyle],
  );

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={isDisabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
    >
      <Animated.View style={[styles.button, containerStyle, isDisabled && styles.disabled, style]}>
        <View style={styles.inner}>
          {loading ? (
            <ActivityIndicator size="small" color={variantSpec.color} style={styles.leading} />
          ) : icon ? (
            <View style={styles.leading}>{icon}</View>
          ) : null}
          <Text style={labelStyle} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default React.memo(AnimatedButton);

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    alignSelf: 'stretch',
    minHeight: 44,
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leading: {
    marginRight: 6,
  },
  label: {
    letterSpacing: 0.4,
    fontWeight: FontWeight.semibold,
  },
  disabled: { opacity: 0.38 },
});
