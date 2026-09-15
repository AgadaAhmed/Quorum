import React, { useEffect, useState } from 'react';
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

  // If a remote avatar fails to load (broken/expired URL), fall back to initials
  // instead of a blank circle. Reset when the source changes.
  const [errored, setErrored] = useState(false);
  const uri = src.kind === 'image' ? src.uri : null;
  useEffect(() => setErrored(false), [uri]);

  return (
    <>
      {src.kind === 'image' && !errored ? (
        <Image
          testID={imageTestID}
          source={{ uri: src.uri }}
          style={imageStyle}
          contentFit="cover"
          autoplay={src.animated}
          onError={() => setErrored(true)}
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
