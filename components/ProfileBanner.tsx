import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Image, ImageStyle } from 'expo-image';

type Props = {
  gifUrl?: string;
  stillUrl?: string;
  /** True only on the full profile screens, where the banner animates. */
  animated?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const DEFAULT_HEIGHT = 150;

export default function ProfileBanner({ gifUrl, stillUrl, animated = false, height = DEFAULT_HEIGHT, style, testID }: Props) {
  const uri = animated ? gifUrl ?? stillUrl : stillUrl ?? gifUrl;
  if (!uri) return null;
  return (
    <Image
      testID={testID ?? 'profile-banner'}
      source={{ uri }}
      style={[{ width: '100%', height }, style as StyleProp<ImageStyle>]}
      contentFit="cover"
      autoplay={animated && !!gifUrl}
      accessibilityIgnoresInvertColors
    />
  );
}
