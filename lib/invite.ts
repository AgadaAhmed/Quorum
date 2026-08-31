// Shareable plan invites.
//
// PLACEHOLDER: the https link points at the Play Store listing. A brand-new user
// can't be auto-joined through a Play Store install (that needs Google Play
// Install Referrer + a real universal-link domain — future work), so the invite
// code is always included in the message for manual entry after install. People
// who already have the app get a one-tap join via the `quorum://` deep link.

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.quorum.app';

/** Deep link an installed app opens to auto-join a plan. Maps to app/join/[code].tsx. */
export function inviteDeepLink(code: string): string {
  return `quorum://join/${code.trim().toUpperCase()}`;
}

/** The message shared via the OS share sheet when inviting friends to a plan. */
export function inviteShareMessage(planTitle: string, code: string): string {
  const c = code.trim().toUpperCase();
  return (
    `Join "${planTitle}" on Quorum!\n\n` +
    `Have the app? Tap to join: ${inviteDeepLink(c)}\n` +
    `New here? Get Quorum: ${PLAY_STORE_URL}\n` +
    `Invite code: ${c}`
  );
}
