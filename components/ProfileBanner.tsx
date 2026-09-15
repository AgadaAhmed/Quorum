import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Image, ImageStyle } from 'expo-image';

type Props = {
  gifUrl?: string;
  stillUrl?: string;
  /** True only on the full profile screens, where the banner animates. */
  animated?: boolean;
  height?: number;
  /** Fill the parent (absolute) instead of using a fixed height. Used as the
   *  hero background, where a fixed height would leave the banner as a strip. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const DEFAULT_HEIGHT = 150;

export default function ProfileBanner({ gifUrl, stillUrl, animated = false, height = DEFAULT_HEIGHT, fill = false, style, testID }: Props) {
  const uri = animated ? gifUrl ?? stillUrl : stillUrl ?? gifUrl;
  if (!uri) return null;
  return (
    <Image
      testID={testID ?? 'profile-banner'}
      source={{ uri }}
      style={[fill ? StyleSheet.absoluteFill : { width: '100%', height }, style as StyleProp<ImageStyle>]}
      contentFit="cover"
      autoplay={animated && !!gifUrl}
      accessibilityIgnoresInvertColors
    />
  );
}
