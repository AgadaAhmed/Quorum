// Single source of truth for how users reach support and the legal pages.
// Previously these were hardcoded (with the wrong `quorum.app` domain) inline in
// settings.tsx; centralize them on the real `quorums.co.za` domain.

export const SUPPORT_EMAIL = 'support@quorums.co.za';
export const PRIVACY_URL = 'https://quorums.co.za/privacy';
export const TERMS_URL = 'https://quorums.co.za/terms';

/** Build a `mailto:` URL to support with an optional prefilled subject. */
export function supportMailto(subject = 'Quorum Support'): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
