import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, type Auth, type Persistence } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// `getReactNativePersistence` ships only in Firebase's React Native build, which
// Metro resolves at runtime. It's absent from the default (web/node) type
// definitions, so we load it through a typed indirection to keep `auth` fully
// typed without changing module resolution project-wide.
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence?: (storage: typeof ReactNativeAsyncStorage) => Persistence;
};

// NOTE: Firebase client config is intentionally client-side and embedded in the
// app bundle. Security is enforced entirely by Firestore/Storage security rules.
// If open-sourcing, move these to environment variables via app.config.js extra.
// Restrict this API key in Google Cloud Console to your app's bundle ID only.
const firebaseConfig = {
  apiKey: 'REDACTED_FIREBASE_KEY_USE_ENV',
  authDomain: 'quorum-323e1.firebaseapp.com',
  projectId: 'quorum-323e1',
  storageBucket: 'quorum-323e1.firebasestorage.app',
  messagingSenderId: '567473106597',
  appId: '1:567473106597:web:0acb465bd61b87eb00a74c',
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
export default app;
