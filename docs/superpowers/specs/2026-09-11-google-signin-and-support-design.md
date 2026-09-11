# Google Sign-In, Profile Completion, Support & Branding — Design

Date: 2026-09-11
Status: Approved (user said "use your best judgement and build")

## Goal

Add a **Google Sign-In** option to Quorum's auth (email/password stays), route
first-time social users through a **profile-completion** step, wire up a real
**support contact** (`support@quorums.co.za`), and make sure **branding** (Google
consent screen + password-reset emails) says "Quorum", not raw Firebase project
identifiers. Phone auth is explicitly a **later phase** (harder + costlier on the
JS-SDK/Expo stack).

## Scope

In scope (this build):
- Google Sign-In via the native `@react-native-google-signin/google-signin`.
- Post-sign-in "Complete your profile" screen for users with no `users/{uid}` doc.
- "Need help?" support links on the login screen and in Settings.
- Support-address / legal-URL centralization (fix wrong `quorum.app` domain).
- Small password-reset copy improvement + the console branding checklist.

Out of scope (later):
- Phone-number auth (separate spec/phase).
- Custom-SMTP password-reset emails sent from the real mailbox (Identity Platform
  upgrade). We brand Firebase's built-in template for now.

## Architecture

### 1. Google Sign-In (code)
- `lib/googleAuth.ts` — the only module that touches the native library. It
  **lazy-requires** `@react-native-google-signin/google-signin` inside functions
  so importing it never crashes Expo Go (mirrors the RevenueCat/`isExpoGo`
  pattern). Exports:
  - `isGoogleAuthAvailable` — `false` in Expo Go.
  - `signInWithGoogle()` — configures with `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
    calls `hasPlayServices()` + `GoogleSignin.signIn()`, extracts the ID token
    (handles both the new `{data:{idToken}}` and legacy `{idToken}` shapes), and
    finishes with `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`.
    Throws a typed `GoogleAuthError` with a `code` we can map in the UI
    (`cancelled`, `in-progress`, `play-services`, `unavailable`, `no-token`).
- `app.json` — add `@react-native-google-signin/google-signin` to `plugins`.
- `login.tsx` — a "Continue with Google" button + an "or" divider, shown under
  both the Log In and Register tabs (hidden when `!isGoogleAuthAvailable`). On
  success we do **not** navigate manually — `onAuthStateChanged` in `_layout.tsx`
  drives routing. Cancellation is silent; other errors set the inline error row.

### 2. Profile completion (code)
- `_layout.tsx` — `RootNavigator` gains a `profileStatus` state fed by an
  `onSnapshot` subscription to `users/{uid}` while authenticated:
  `'loading' | 'complete' | 'incomplete'`. "Complete" = doc exists AND has a
  non-empty `username`. The routing effect:
  - authed + `incomplete` + not already on `complete-profile` → replace to
    `/(auth)/complete-profile`.
  - authed + `complete` + in `(auth)` → replace to `/(tabs)`.
  - Splash while `user === undefined` OR (`user` && `profileStatus === 'loading'`).
- `app/(auth)/complete-profile.tsx` — collects **display name** (pre-filled from
  the Google profile, editable), **username** (validated via the existing
  `checkUsername` callable), **country** (fixed picker, `withEmoji`), **city**
  (optional). Writes the `users/{uid}` doc with the same shape as email register
  (minus password). Reuses `lib/cities` + the country picker. No manual nav —
  once the doc is written the gate promotes the user to `(tabs)`.
- `app/(auth)/_layout.tsx` — register the `complete-profile` screen.

### 3. Support + legal (code)
- `lib/support.ts` — single source of truth:
  `SUPPORT_EMAIL = 'support@quorums.co.za'`, `PRIVACY_URL`, `TERMS_URL`
  (both on `quorums.co.za`), and `supportMailto(subject?)` building the
  `mailto:` URL.
- `login.tsx` — a "Need help? Contact support" link at the bottom that opens the
  mailto via `Linking`.
- `settings.tsx` — import from `lib/support`; **fix** the hardcoded
  `support@quorum.app` and the `quorum.app/privacy|terms` URLs to the real domain.

### 4. Password-reset improvement (code + console)
- App already calls `sendPasswordResetEmail` correctly (login + settings).
- Copy: add "Didn't get it? Check spam or contact support@quorums.co.za" to the
  login reset-sent confirmation.
- Note the intentional anti-enumeration behavior: Forgot-password shows success
  even for non-existent accounts, so a missing email in that case is by design.

## Console setup (owner: user — cannot be done from code)

1. **Firebase Console → Authentication → Sign-in method**: enable **Google**;
   set the project **support email** to `support@quorums.co.za`.
2. **Google Cloud Console → APIs & Services → OAuth consent screen**: App name
   `Quorum`, logo, user support email `support@quorums.co.za`, authorized domain
   `quorums.co.za`, developer contact. **Publish to Production** (scopes
   email/profile/openid are non-sensitive → no Google verification). *This is the
   fix for the "signing into Firebase + a bunch of numbers" text.*
3. **Google Cloud Console → Credentials**:
   - **Android OAuth client**: package `quorums.co.za`, SHA-1 = **BOTH** the
     upload keystore (`com.quorum.app` key, `8B:55:E8:27…`) **and** the Play App
     Signing key (Play Console → Test and release → App integrity → App signing
     key certificate). Missing the Play key → `DEVELOPER_ERROR` on the beta build.
   - **Web client**: copy its client ID → this is `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
4. **EAS**: `eas env:create` (production) `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
5. **Firebase Console → Authentication → Templates**: brand **Password reset**
   (and Email verification) — sender name `Quorum`, custom subject/body, action
   domain `quorums.co.za`. Verify deliverability (spam).

## Testing

- `tsc --noEmit` clean.
- `jest`: add `__mocks__`/jest.setup entry for `@react-native-google-signin/google-signin`;
  unit-test `lib/support.ts` (mailto building, domain) and `lib/googleAuth.ts`
  token extraction + error mapping (native module mocked). Existing suites stay green.
- On-device (EAS build): Google sign-in happy path, cancellation, new-user →
  complete-profile → app, returning-user → straight to app, "Need help?" mailto,
  password reset delivery.

## Risks / notes

- Native module → **Expo Go can't run Google Sign-In**; button hidden there.
  Real verification requires an EAS build (versionCode 5).
- The SHA-1/Play-signing gotcha (step 3) is the most common failure mode.
- Reusing the country/city picker inline in `complete-profile` duplicates some
  `login.tsx` markup; acceptable for now, candidate for a later `CountrySelect`
  extraction.
