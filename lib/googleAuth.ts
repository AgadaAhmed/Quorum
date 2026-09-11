// Google Sign-In wrapper. This is the ONLY module that touches the native
// `@react-native-google-signin/google-signin` package. It is lazy-required
// inside functions so that merely importing this file never pulls the native
// module in — which would crash Expo Go (same reasoning as the RevenueCat /
// expo-notifications `isExpoGo` guards in app/_layout.tsx).
import { GoogleAuthProvider, signInWithCredential, type UserCredential } from 'firebase/auth';
import Constants from 'expo-constants';
import { auth } from './firebase';

const isExpoGo = Constants.appOwnership === 'expo';

// Google Sign-In relies on a native module, so it can't run in Expo Go. The UI
// hides the button when this is false.
export const isGoogleAuthAvailable = !isExpoGo;

export type GoogleAuthErrorCode =
  | 'cancelled'
  | 'in-progress'
  | 'play-services'
  | 'unavailable'
  | 'no-token'
  | 'unknown';

export class GoogleAuthError extends Error {
  code: GoogleAuthErrorCode;
  constructor(code: GoogleAuthErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'GoogleAuthError';
  }
}

let configured = false;

function loadModule(): any {
  if (!isGoogleAuthAvailable) {
    throw new GoogleAuthError('unavailable', 'Google Sign-In is unavailable in Expo Go');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-google-signin/google-signin');
}

function ensureConfigured(mod: any): void {
  if (configured) return;
  mod.GoogleSignin.configure({
    // The OAuth 2.0 "Web client" ID from Google Cloud (the one Firebase creates).
    // Baked in at build time via EAS env; without it Google returns no ID token.
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  configured = true;
}

/**
 * Pull the ID token out of a GoogleSignin.signIn() response, tolerating both the
 * current `{ type, data: { idToken } }` shape (v13+) and the legacy `{ idToken }`
 * shape. Returns null for a cancelled/empty response. Exported for tests.
 */
export function extractIdToken(response: any): string | null {
  if (!response) return null;
  if (response.type === 'cancelled') return null;
  return response?.data?.idToken ?? response?.idToken ?? null;
}

/**
 * Map a GoogleAuthErrorCode to a user-facing message, or null when the UI should
 * stay silent (user cancelled). Exported for tests + the login screen.
 */
export function googleErrorMessage(code: GoogleAuthErrorCode): string | null {
  switch (code) {
    case 'cancelled':
      return null;
    case 'in-progress':
      return 'Sign-in is already in progress';
    case 'play-services':
      return 'Google Play Services is required to sign in with Google';
    case 'no-token':
      return 'Could not complete Google sign-in. Please try again';
    case 'unavailable':
      return 'Google sign-in needs the full app build';
    default:
      return 'Could not sign in with Google. Please try again';
  }
}

/**
 * Run the native Google account flow and sign the user into Firebase. Resolves
 * with the Firebase UserCredential; throws a GoogleAuthError with a mappable
 * `code` on any failure (including user cancellation). Routing after success is
 * handled by the onAuthStateChanged gate in app/_layout.tsx.
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  const mod = loadModule();
  const { GoogleSignin, statusCodes } = mod;
  ensureConfigured(mod);
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response?.type === 'cancelled') {
      throw new GoogleAuthError('cancelled');
    }
    const idToken = extractIdToken(response);
    if (!idToken) {
      throw new GoogleAuthError('no-token', 'Google did not return an ID token');
    }
    const credential = GoogleAuthProvider.credential(idToken);
    return await signInWithCredential(auth, credential);
  } catch (e: any) {
    if (e instanceof GoogleAuthError) throw e;
    const code = e?.code;
    if (statusCodes) {
      if (code === statusCodes.SIGN_IN_CANCELLED) throw new GoogleAuthError('cancelled');
      if (code === statusCodes.IN_PROGRESS) throw new GoogleAuthError('in-progress');
      if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new GoogleAuthError('play-services');
    }
    throw new GoogleAuthError('unknown', e?.message);
  }
}
