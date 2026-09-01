/** IDs of the curated avatar decorations. Assets are wired up in a later plan. */
export type DecorationId = 'cat-ears' | 'glitch' | 'sparkle';

/**
 * Registry of decoration overlays: id -> { asset (require()'d image), animated }.
 * Intentionally EMPTY here — populated in a later plan once the art exists.
 * The Avatar component treats a missing id as "no decoration".
 */
export const DECORATIONS: Partial<Record<DecorationId, { asset: number; animated: boolean }>> = {};

/** All optional profile-customization fields stored on the Firestore user doc. */
export type ProfileCustomization = {
  avatarUrl?: string;        // existing static upload (free tier)
  avatarGifUrl?: string;     // Tenor animated pfp (Pro)
  avatarStillUrl?: string;   // Tenor preview still for lists
  bannerGifUrl?: string;
  bannerStillUrl?: string;
  decorationId?: DecorationId | null;
  bio?: string;
  tagline?: string;
  profileAccent?: string;
  nameColor?: string;
};

export type AvatarSource =
  | { kind: 'image'; uri: string; animated: boolean }
  | { kind: 'initials' };

/**
 * Decide which source an avatar renders.
 * Precedence: animated gif (profile screens only) -> still frame -> uploaded avatar -> initials.
 */
export function resolveAvatarSource(opts: {
  animated?: boolean;
  gifUrl?: string;
  stillUrl?: string;
  uploadUrl?: string;
}): AvatarSource {
  const { animated, gifUrl, stillUrl, uploadUrl } = opts;
  if (animated && gifUrl) return { kind: 'image', uri: gifUrl, animated: true };
  if (stillUrl) return { kind: 'image', uri: stillUrl, animated: false };
  if (uploadUrl) return { kind: 'image', uri: uploadUrl, animated: false };
  return { kind: 'initials' };
}

/** First letter of a name, uppercased; 'U' when absent. */
export function initialsFor(name?: string): string {
  const c = name?.trim()?.[0];
  return (c || 'U').toUpperCase();
}
