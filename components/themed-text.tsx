import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { FontSize, FontWeight } from '@/lib/theme';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: FontSize.md,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: FontSize.md,
    lineHeight: 24,
    fontWeight: FontWeight.semibold,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    lineHeight: 26,
  },
  link: {
    fontSize: FontSize.md,
    lineHeight: 24,
    textDecorationLine: 'underline',
  },
});
