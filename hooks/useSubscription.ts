import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { SubscriptionTier } from '../lib/subscription';

export function useSubscription() {
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }

    // Firestore is the source of truth for entitlement. `subscriptionTier` is
    // written ONLY by the RevenueCat webhook Cloud Function (Admin SDK); clients
    // can read it but can no longer write it (see firestore.rules). The client
    // therefore just listens — when RevenueCat fires the webhook after a purchase,
    // the field flips here in real time.
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const data = snap.data();
        setTier(data?.subscriptionTier ?? 'free');
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, []);

  return { tier, isPro: tier === 'pro', loading };
}
