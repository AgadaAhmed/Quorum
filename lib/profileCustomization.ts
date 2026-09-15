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
  avatarGifUrl?: string;     // Klipy animated pfp (Pro)
  avatarStillUrl?: string;   // Klipy preview still for lists
  bannerGifUrl?: string;
  bannerStillUrl?: string;
  decorationId?: DecorationId | null;
  bio?: string;
  tagline?: string;
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
  if (stillUrl) {
    // A .gif used as a "still" renders as a black frame on Android when autoplay
    // is off, so animate it instead of showing a black box. Newer avatars store
    // a real static still (a .jpg from the GIF provider) and stay non-animated.
    const stillIsGif = /\.gif(\?|#|$)/i.test(stillUrl);
    return { kind: 'image', uri: stillUrl, animated: stillIsGif };
  }
  if (uploadUrl) return { kind: 'image', uri: uploadUrl, animated: false };
  // No still or upload, but a gif exists → show the animated gif rather than a
  // blank/initials avatar, so friends' gif pfps still appear everywhere.
  if (gifUrl) return { kind: 'image', uri: gifUrl, animated: true };
  return { kind: 'initials' };
}

/** First letter of a name, uppercased; 'U' when absent. */
export function initialsFor(name?: string): string {
  const c = name?.trim()?.[0];
  return (c || 'U').toUpperCase();
}

/** Curated profile colors. Chosen mid-saturation so display-name text stays
 *  legible on both light and (future) dark profile surfaces — the readability
 *  floor. Users pick from these keys; we never store arbitrary hex. */
export type ProfileColor = { key: string; label: string; value: string };

export const PROFILE_COLORS: ProfileColor[] = [
  { key: 'crimson', label: 'Crimson', value: '#D64545' },
  { key: 'amber', label: 'Amber', value: '#B8860B' },
  { key: 'emerald', label: 'Emerald', value: '#1E9E52' },
  { key: 'teal', label: 'Teal', value: '#0E9AA7' },
  { key: 'azure', label: 'Azure', value: '#2E6FD6' },
  { key: 'indigo', label: 'Indigo', value: '#5B54D6' },
  { key: 'violet', label: 'Violet', value: '#8B46C7' },
  { key: 'rose', label: 'Rose', value: '#C6417F' },
  { key: 'slate', label: 'Slate', value: '#5A6472' },
];

/** Hex for a palette key, or undefined if unset/unknown. */
export function resolveColor(key?: string): string | undefined {
  return PROFILE_COLORS.find((c) => c.key === key)?.value;
}

export const BIO_MAX = { free: 150, pro: 300 } as const;
export function bioMaxFor(isPro: boolean): number {
  return isPro ? BIO_MAX.pro : BIO_MAX.free;
}

export const TAGLINE_MAX = 60;

// NOTE: the "profile accent" (a tint/fill behind the profile hero) was removed
// on 2026-09-13 — it read as broken/empty in practice. The profile background is
// now: banner GIF if set, else the plain theme background. `nameColor` (from
// PROFILE_COLORS) is still used for the display name.
