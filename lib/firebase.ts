import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, type Auth, type Persistence } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, type Functions } from 'firebase/functions';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// `getReactNativePersistence` ships only in Firebase's React Native build, which
// Metro resolves at runtime. It's absent from the default (web/node) type
// definitions, so we load it through a typed indirection to keep `auth` fully
// typed without changing module resolution project-wide.
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence?: (storage: typeof ReactNativeAsyncStorage) => Persistence;
};

// Firebase client config is client-side by design (embedded in the app bundle);
// security is enforced by Firestore/Storage security rules, and the API key is
// restricted in Google Cloud Console to this app's bundle ID. The values are read
// from EXPO_PUBLIC_* env vars (see .env.example) so no key is committed to git.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// initializeAuth with AsyncStorage so auth state persists across app restarts.
// Wrapped in try/catch because initializeAuth throws if called twice (e.g. HMR)
// and because the RN persistence helper is unavailable on web/node builds.
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence!(ReactNativeAsyncStorage),
  });
} catch {
  auth = getAuth(app);
}
export { auth };
// getFirestore uses React Native's built-in persistence (no IndexedDB needed)
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
// Callable Cloud Functions (default region us-central1, matching functions/).
export const functions: Functions = getFunctions(app);
export default app;
