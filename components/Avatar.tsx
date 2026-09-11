import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Image, ImageStyle } from 'expo-image';
import {
  resolveAvatarSource,
  initialsFor,
  DECORATIONS,
  DecorationId,
} from '../lib/profileCustomization';

type AvatarProps = {
  name?: string;
  uploadUrl?: string;
  gifUrl?: string;
  stillUrl?: string;
  decorationId?: DecorationId | null;
  /** True only on the full profile screens, where animated pfps play. */
  animated?: boolean;
  imageStyle?: StyleProp<ImageStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  initialStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export default function Avatar({
  name,
  uploadUrl,
  gifUrl,
  stillUrl,
  decorationId,
  animated = false,
  imageStyle,
  fallbackStyle,
  initialStyle,
  testID,
}: AvatarProps) {
  const src = resolveAvatarSource({ animated, gifUrl, stillUrl, uploadUrl });
  const decoration = decorationId ? DECORATIONS[decorationId] : undefined;
  const imageTestID = testID ? `${testID}-image` : 'avatar-image';

  return (
    <>
      {src.kind === 'image' ? (
        <Image
          testID={imageTestID}
          source={{ uri: src.uri }}
          style={imageStyle}
          contentFit="cover"
          autoplay={src.animated}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={fallbackStyle}>
          <Text style={initialStyle}>{initialsFor(name)}</Text>
        </View>
      )}
      {decoration ? (
        <Image
          testID="avatar-decoration"
          source={decoration.asset}
          style={StyleSheet.absoluteFill as StyleProp<ImageStyle>}
          contentFit="contain"
          autoplay={animated}
          pointerEvents="none"
        />
      ) : null}
    </>
  );
}
