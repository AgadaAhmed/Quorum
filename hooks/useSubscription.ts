import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { SubscriptionTier } from '../lib/subscription';

export function useSubscription() {
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Track auth state rather than reading auth.currentUser once: on a cold
    // start Firebase restores the session asynchronously, so currentUser is
    // often still null when this hook first mounts. Without the listener a
    // Pro user would be stuck on the free tier until the component remounted.
    let unsubTier: Unsubscribe | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubTier?.();
      unsubTier = null;

      if (!user) {
        setTier('free');
        setLoading(false);
        return;
      }

      // Firestore is the source of truth for entitlement. `subscriptionTier` is
      // written ONLY by the RevenueCat webhook Cloud Function (Admin SDK); clients
      // can read it but can no longer write it (see firestore.rules). The client
      // therefore just listens — when RevenueCat fires the webhook after a purchase,
      // the field flips here in real time.
      unsubTier = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const data = snap.data();
          setTier(data?.subscriptionTier ?? 'free');
          setLoading(false);
        },
        () => setLoading(false)
      );
    });

    return () => {
      unsubAuth();
      unsubTier?.();
    };
  }, []);

  return { tier, isPro: tier === 'pro', loading };
}
