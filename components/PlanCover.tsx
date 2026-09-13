import React, { useEffect, useState } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Image, ImageStyle } from 'expo-image';
import PlanBanner from './PlanBanner';

type Props = {
  category?: string;
  seed: string;
  /** Google place photo resource name, when the plan was made from a venue. */
  photoRef?: string | null;
  variant?: 'hero' | 'card' | 'thumb';
  style?: StyleProp<ViewStyle>;
};

/**
 * A plan's banner image. When the plan carries a venue photo (place.photoRef)
 * it resolves + shows that photo; otherwise it falls back to the generated
 * monochrome PlanBanner. The photo is resolved live per Google's terms (short-
 * lived URL), once per mount, mirroring PlaceCard.
 */
export default function PlanCover({ category, seed, photoRef, variant = 'card', style }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (photoRef) {
      // Lazy require keeps lib/places (and its firebase/functions ESM import)
      // out of the static graph, so component tests need not mock firebase.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { placePhotoUrl } = require('../lib/places');
      placePhotoUrl(photoRef, variant === 'hero' ? 1000 : 600).then((u: string | null) => {
        if (!cancelled) setUrl(u);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [photoRef, variant]);

  if (photoRef && url) {
    return (
      <Image
        source={{ uri: url }}
        style={style as StyleProp<ImageStyle>}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  // No venue photo (or still loading) → the generated banner.
  return <PlanBanner category={category} seed={seed} variant={variant} style={style} />;
}
