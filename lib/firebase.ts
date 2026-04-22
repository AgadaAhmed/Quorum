import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'REDACTED_FIREBASE_KEY_USE_ENV',
  authDomain: 'quorum-323e1.firebaseapp.com',
  projectId: 'quorum-323e1',
  storageBucket: 'quorum-323e1.firebasestorage.app',
  messagingSenderId: '567473106597',
  appId: '1:567473106597:web:0acb465bd61b87eb00a74c',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
export const storage = getStorage(app);
export default app;
