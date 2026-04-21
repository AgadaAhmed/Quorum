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
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../lib/theme';

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
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 80, bounciness: 3 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 55, bounciness: 12 }).start();

  const isDisabled = disabled || loading;

  const paddingV = size === 'sm' ? 8 : size === 'lg' ? 16 : 12;
  const paddingH = size === 'sm' ? 16 : size === 'lg' ? 28 : Spacing.lg;
  const fontSize = size === 'sm' ? FontSize.sm : size === 'lg' ? FontSize.lg : FontSize.md;

  const txtColor =
    variant === 'gold' ? '#1a1000' :
    variant === 'ghost' ? Colors.primary :
    variant === 'secondary' ? Colors.text :
    variant === 'danger' ? Colors.error :
    '#fff';

  const content = (
    <View style={[styles.inner, { paddingVertical: paddingV, paddingHorizontal: paddingH }]}>
      {loading ? (
        <ActivityIndicator size="small" color={txtColor} style={{ marginRight: 6 }} />
      ) : icon ? (
        <View style={{ marginRight: 6 }}>{icon}</View>
      ) : null}
      <Text style={[styles.label, { fontSize, color: txtColor, fontWeight: FontWeight.semibold }, textStyle]}>
        {label}
      </Text>
    </View>
  );

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
          { transform: [{ scale }] },
          isDisabled && styles.disabled,
          style,
        ]}
      >
        {variant === 'primary' && (
          <LinearGradient
            colors={['#fb7185', '#f43f5e', '#e11d48']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full }]}
          />
        )}
        {variant === 'gold' && (
          <LinearGradient
            colors={['#FFE55C', '#FFD700', '#d4a800']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full }]}
          />
        )}
        {variant === 'secondary' && (
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full, backgroundColor: Colors.surfaceOverlay, borderWidth: 1, borderColor: Colors.glassBorderStrong }]} />
        )}
        {variant === 'ghost' && (
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.primaryBorder }]} />
        )}
        {variant === 'danger' && (
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.error + '55' }]} />
        )}
        {content}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.full,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    letterSpacing: 0.2,
  },
  disabled: { opacity: 0.38 },
});
