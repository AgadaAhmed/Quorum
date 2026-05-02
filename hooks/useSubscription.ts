import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { auth, db } from '../lib/firebase';
import { SubscriptionTier } from '../lib/subscription';

export function useSubscription() {
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }

    // Listen to Firestore for real-time tier updates
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      const data = snap.data();
      setTier(data?.subscriptionTier ?? 'free');
      setLoading(false);
    });

    // Check RevenueCat on mount and sync tier to Firestore
    Purchases.getCustomerInfo().then((info: CustomerInfo) => {
      const isPro = typeof info.entitlements.active['pro'] !== 'undefined';
      const newTier: SubscriptionTier = isPro ? 'pro' : 'free';
      updateDoc(doc(db, 'users', uid), {
        subscriptionTier: newTier,
        subscriptionExpiresAt: isPro
          ? info.entitlements.active['pro'].expirationDate
          : null,
      }).catch(() => {}); // best-effort sync
    }).catch(() => {});

    return unsub;
  }, []);

  return { tier, isPro: tier === 'pro', loading };
}
