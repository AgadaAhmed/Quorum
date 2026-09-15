// Shareable plan invites.
//
// The invite link is a real https link on our own domain: quorums.co.za/join/<code>.
// It's tappable everywhere (unlike the quorum:// scheme, which messaging apps
// don't linkify), and behaves correctly for both audiences:
//   • App installed  → Android App Links opens the app straight to the plan
//     (verified via /.well-known/assetlinks.json on quorums.co.za + the
//     autoVerify intent filter in app.json → routes to app/join/[code].tsx).
//   • No app          → the quorums.co.za web app's /join/:code page joins them
//     on the web (or sends them to sign in / get the app).

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=quorums.co.za';

/** Web + App Links join URL. Opens the app if installed, else the web join page. */
export function inviteWebLink(code: string): string {
  return `https://quorums.co.za/join/${code.trim().toUpperCase()}`;
}

/** Raw custom-scheme deep link. Kept for internal use; not shared in messages
 *  (messaging apps don't make quorum:// tappable). */
export function inviteDeepLink(code: string): string {
  return `quorum://join/${code.trim().toUpperCase()}`;
}

/** The message shared via the OS share sheet when inviting friends to a plan. */
export function inviteShareMessage(planTitle: string, code: string): string {
  const c = code.trim().toUpperCase();
  return (
    `Join "${planTitle}" on Quorum!\n\n` +
    `Tap to join: ${inviteWebLink(c)}\n` +
    `Invite code: ${c}`
  );
}
