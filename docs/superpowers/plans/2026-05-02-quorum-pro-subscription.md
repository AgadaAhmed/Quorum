# Quorum Pro — Phase 1 Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement free tier limits, Quorum Pro subscription, paywall UI, and RevenueCat in-app purchase flow.

**Architecture:** Subscription state is stored in the Firestore user document (`subscriptionTier: 'free' | 'pro'`) and synced after successful RevenueCat purchases. A `useSubscription()` hook provides `isPro` throughout the app. Limits are enforced at the point of action (plan creation, moments upload, etc.) and a `PaywallModal` is shown when a user hits a wall. Safety features are never gated.

**Tech Stack:** `react-native-purchases` (RevenueCat), Firebase Firestore, React Native 0.83, Expo SDK 55, TypeScript, `jest-expo`, `@testing-library/react-native`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `lib/subscription.ts` | Limit constants + pure check functions |
| Create | `hooks/useSubscription.ts` | React hook — reads tier from Firestore |
| Create | `components/PaywallModal.tsx` | Full-screen upgrade modal |
| Create | `__tests__/subscription.test.ts` | Unit tests for lib/subscription.ts |
| Modify | `lib/firebase.ts` | No change needed |
| Modify | `firestore.rules` | Allow reads on subscriptionTier |
| Modify | `app/create-plan.tsx` | Enforce 3-plan limit + 2-template limit |
| Modify | `app/plan-detail.tsx` | Enforce 10-moments limit |
| Modify | `app/chat.tsx` | Enforce 30-day chat history for free users |
| Modify | `app/settings.tsx` | Add subscription status + manage/upgrade section |

---

## Task 1: Jest Setup

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`
- Create: `__tests__/subscription.test.ts`

- [ ] **Step 1: Install Jest dependencies**

```bash
npx expo install jest-expo @testing-library/react-native @types/jest
```

- [ ] **Step 2: Add jest config to package.json**

In `package.json`, add after `"private": true`:

```json
"jest": {
  "preset": "jest-expo",
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)"
  ]
}
```

- [ ] **Step 3: Add test script to package.json**

In `package.json` scripts block, add:

```json
"test": "jest"
```

- [ ] **Step 4: Create the test file (failing — module does not exist yet)**

Create `__tests__/subscription.test.ts`:

```typescript
import {
  isAtPlanLimit,
  isAtMomentsLimit,
  isAtTemplatesLimit,
  getChatHistoryCutoff,
  FREE_LIMITS,
} from '../lib/subscription';

describe('isAtPlanLimit', () => {
  it('returns false for pro users regardless of count', () => {
    expect(isAtPlanLimit(100, 'pro')).toBe(false);
  });
  it('returns false when under limit', () => {
    expect(isAtPlanLimit(2, 'free')).toBe(false);
  });
  it('returns true at exactly the limit', () => {
    expect(isAtPlanLimit(FREE_LIMITS.activePlans, 'free')).toBe(true);
  });
  it('returns true when over limit', () => {
    expect(isAtPlanLimit(FREE_LIMITS.activePlans + 1, 'free')).toBe(true);
  });
});

describe('isAtMomentsLimit', () => {
  it('returns false for pro users regardless of count', () => {
    expect(isAtMomentsLimit(100, 'pro')).toBe(false);
  });
  it('returns false when under limit', () => {
    expect(isAtMomentsLimit(5, 'free')).toBe(false);
  });
  it('returns true at exactly the limit', () => {
    expect(isAtMomentsLimit(FREE_LIMITS.momentsPerPlan, 'free')).toBe(true);
  });
});

describe('isAtTemplatesLimit', () => {
  it('returns false for pro users regardless of count', () => {
    expect(isAtTemplatesLimit(100, 'pro')).toBe(false);
  });
  it('returns true at exactly the limit', () => {
    expect(isAtTemplatesLimit(FREE_LIMITS.templates, 'free')).toBe(true);
  });
});

describe('getChatHistoryCutoff', () => {
  it('returns null for pro users (no cutoff)', () => {
    expect(getChatHistoryCutoff('pro')).toBeNull();
  });
  it('returns a date approximately 30 days ago for free users', () => {
    const cutoff = getChatHistoryCutoff('free');
    expect(cutoff).not.toBeNull();
    const diffDays = (Date.now() - cutoff!.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(FREE_LIMITS.chatHistoryDays, 0);
  });
});
```

- [ ] **Step 5: Run tests — expect failure (module missing)**

```bash
npm test
```

Expected: `Cannot find module '../lib/subscription'`

---

## Task 2: Subscription Logic Module

**Files:**
- Create: `lib/subscription.ts`

- [ ] **Step 1: Create `lib/subscription.ts`**

```typescript
export type SubscriptionTier = 'free' | 'pro';

export const FREE_LIMITS = {
  activePlans: 3,
  momentsPerPlan: 10,
  chatHistoryDays: 30,
  templates: 2,
} as const;

export function isAtPlanLimit(activePlanCount: number, tier: SubscriptionTier): boolean {
  if (tier === 'pro') return false;
  return activePlanCount >= FREE_LIMITS.activePlans;
}

export function isAtMomentsLimit(momentsCount: number, tier: SubscriptionTier): boolean {
  if (tier === 'pro') return false;
  return momentsCount >= FREE_LIMITS.momentsPerPlan;
}

export function isAtTemplatesLimit(templateCount: number, tier: SubscriptionTier): boolean {
  if (tier === 'pro') return false;
  return templateCount >= FREE_LIMITS.templates;
}

export function getChatHistoryCutoff(tier: SubscriptionTier): Date | null {
  if (tier === 'pro') return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FREE_LIMITS.chatHistoryDays);
  return cutoff;
}
```

- [ ] **Step 2: Run tests — expect all passing**

```bash
npm test
```

Expected: `PASS __tests__/subscription.test.ts` — 8 tests passing.

- [ ] **Step 3: Commit**

```bash
git add lib/subscription.ts __tests__/subscription.test.ts package.json
git commit -m "feat: add subscription limit logic + Jest setup"
```

---

## Task 3: Install RevenueCat

**Files:**
- Modify: `package.json` (dependency added)
- Modify: `lib/firebase.ts` (no change — just confirm RevenueCat init location)

> RevenueCat requires a development build — it will not work in Expo Go. Run `expo prebuild` then `expo run:ios` / `expo run:android`.

- [ ] **Step 1: Install react-native-purchases**

```bash
npx expo install react-native-purchases
```

- [ ] **Step 2: Create RevenueCat API key constants**

In `lib/subscription.ts`, add at the top after the imports:

```typescript
// Replace these with your actual RevenueCat API keys from app.revenuecat.com
export const RC_API_KEY_IOS = 'appl_REPLACE_WITH_IOS_KEY';
export const RC_API_KEY_ANDROID = 'goog_REPLACE_WITH_ANDROID_KEY';

// Product IDs — must match what you configure in App Store Connect / Google Play Console
export const RC_MONTHLY_PRODUCT_ID = 'quorum_pro_monthly';
export const RC_ANNUAL_PRODUCT_ID = 'quorum_pro_annual';
```

- [ ] **Step 3: Initialize RevenueCat in app root**

Open `app/_layout.tsx`. Find the outermost component and add RevenueCat initialization.

At the top of `app/_layout.tsx` add the import:

```typescript
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import { RC_API_KEY_IOS, RC_API_KEY_ANDROID } from '../lib/subscription';
```

Inside the root layout component, add a `useEffect` before the return statement:

```typescript
useEffect(() => {
  const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
  Purchases.setLogLevel(LOG_LEVEL.VERBOSE); // remove before production
  Purchases.configure({ apiKey });
}, []);
```

- [ ] **Step 4: Commit**

```bash
git add lib/subscription.ts app/_layout.tsx package.json package-lock.json
git commit -m "feat: install RevenueCat + configure API keys"
```

---

## Task 4: Firestore Schema + Rules Update

**Files:**
- Modify: `firestore.rules`

The `users/{uid}` document gets two new fields:
- `subscriptionTier: 'free' | 'pro'` (default `'free'` — absent = free)
- `subscriptionExpiresAt: Timestamp | null`

No migration needed — absent field is treated as `'free'` everywhere in the code.

- [ ] **Step 1: Update Firestore rules**

Open `firestore.rules`. Find the `match /users/{userId}` block. Ensure any authenticated user can read their own subscription tier. The existing user read rule already covers this — verify it includes:

```
allow read: if request.auth != null && request.auth.uid == userId;
allow update: if request.auth != null && request.auth.uid == userId;
```

If the update rule restricts specific fields, add `subscriptionTier` and `subscriptionExpiresAt` to the allowed fields list.

- [ ] **Step 2: Deploy rules**

```bash
firebase deploy --only firestore:rules
```

Expected: `Deploy complete!`

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: allow subscriptionTier field in Firestore user rules"
```

---

## Task 5: useSubscription Hook

**Files:**
- Create: `hooks/useSubscription.ts`

- [ ] **Step 1: Create `hooks/useSubscription.ts`**

```typescript
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

    // Also check RevenueCat on mount and sync to Firestore
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
```

- [ ] **Step 2: Commit**

```bash
git add hooks/useSubscription.ts
git commit -m "feat: add useSubscription hook (Firestore + RevenueCat sync)"
```

---

## Task 6: PaywallModal Component

**Files:**
- Create: `components/PaywallModal.tsx`

- [ ] **Step 1: Create `components/PaywallModal.tsx`**

```typescript
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Purchases from 'react-native-purchases';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { RC_MONTHLY_PRODUCT_ID, RC_ANNUAL_PRODUCT_ID } from '../lib/subscription';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  reason?: string; // e.g. "You've reached your 3-plan limit"
}

export default function PaywallModal({ visible, onClose, reason }: Props) {
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');

  const handlePurchase = async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const productId = selectedPlan === 'annual' ? RC_ANNUAL_PRODUCT_ID : RC_MONTHLY_PRODUCT_ID;
      const { customerInfo } = await Purchases.purchaseStoreProduct(
        (await Purchases.getProducts([productId]))[0]
      );
      const isPro = typeof customerInfo.entitlements.active['pro'] !== 'undefined';
      if (isPro) {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await updateDoc(doc(db, 'users', uid), { subscriptionTier: 'pro' });
        }
        onClose();
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        // purchase error — silent for now, user can retry
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const info = await Purchases.restorePurchases();
      const isPro = typeof info.entitlements.active['pro'] !== 'undefined';
      if (isPro) {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await updateDoc(doc(db, 'users', uid), { subscriptionTier: 'pro' });
        }
        onClose();
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#0D0D0F', '#1A0A1E']} style={styles.container}>
        {/* Header */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        <Text style={styles.crown}>✦</Text>
        <Text style={styles.title}>Quorum Pro</Text>
        {reason ? <Text style={styles.reason}>{reason}</Text> : null}

        {/* Feature list */}
        <View style={styles.features}>
          {[
            'Unlimited active plans',
            'Unlimited moments + HD quality',
            'Full chat history',
            'Unlimited templates',
            'Custom plan covers & themes',
            'Plan analytics',
          ].map((f) => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.featureCheck}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {/* Plan selector */}
        <View style={styles.planRow}>
          <TouchableOpacity
            style={[styles.planOption, selectedPlan === 'annual' && styles.planOptionSelected]}
            onPress={() => setSelectedPlan('annual')}
          >
            <Text style={styles.planLabel}>Annual</Text>
            <Text style={styles.planPrice}>$44.99 / yr</Text>
            <Text style={styles.planSavings}>Save 37%</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.planOption, selectedPlan === 'monthly' && styles.planOptionSelected]}
            onPress={() => setSelectedPlan('monthly')}
          >
            <Text style={styles.planLabel}>Monthly</Text>
            <Text style={styles.planPrice}>$5.99 / mo</Text>
          </TouchableOpacity>
        </View>

        {/* CTA */}
        <TouchableOpacity style={styles.ctaBtn} onPress={handlePurchase} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.ctaText}>Get Quorum Pro</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={loading}>
          <Text style={styles.restoreText}>Restore purchases</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>
          Subscription auto-renews. Cancel anytime in App Store / Google Play settings.
        </Text>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 60 },
  closeBtn: { position: 'absolute', top: 16, right: 16, padding: 8 },
  closeBtnText: { color: Colors.textMuted, fontSize: 18 },
  crown: { fontSize: 40, color: Colors.primary, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: FontWeight.bold as any, color: Colors.text, marginBottom: 8 },
  reason: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', marginBottom: 24 },
  features: { alignSelf: 'stretch', gap: 10, marginBottom: 32 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureCheck: { color: Colors.primary, fontSize: 16, width: 20 },
  featureText: { color: Colors.text, fontSize: FontSize.md },
  planRow: { flexDirection: 'row', gap: 12, marginBottom: 24, alignSelf: 'stretch' },
  planOption: {
    flex: 1, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.glassBorder,
    padding: Spacing.md, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  planOptionSelected: { borderColor: Colors.primary, backgroundColor: 'rgba(139,92,246,0.12)' },
  planLabel: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: 4 },
  planPrice: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  planSavings: { color: Colors.primary, fontSize: FontSize.xs, marginTop: 2 },
  ctaBtn: {
    alignSelf: 'stretch', backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  ctaText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  restoreBtn: { padding: 8, marginBottom: 16 },
  restoreText: { color: Colors.textMuted, fontSize: FontSize.sm },
  legal: { color: Colors.textMuted, fontSize: 11, textAlign: 'center', paddingHorizontal: Spacing.md },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/PaywallModal.tsx
git commit -m "feat: add PaywallModal with RevenueCat purchase + restore"
```

---

## Task 7: Enforce Plan Creation Limit

**Files:**
- Modify: `app/create-plan.tsx`

The limit check: count active plans created by the user (`status !== 'archived'`, `createdBy === uid`) before allowing creation.

- [ ] **Step 1: Add imports to `app/create-plan.tsx`**

At the top of the file, add:

```typescript
import { getDocs, query, collection, where } from 'firebase/firestore';
import { isAtPlanLimit, isAtTemplatesLimit } from '../lib/subscription';
import { useSubscription } from '../hooks/useSubscription';
import PaywallModal from '../components/PaywallModal';
```

- [ ] **Step 2: Add hook + paywall state inside `CreatePlanScreen`**

Inside the component body, after existing `useState` calls:

```typescript
const { isPro } = useSubscription();
const [showPaywall, setShowPaywall] = useState(false);
```

- [ ] **Step 3: Add the limit check inside the submit handler**

Find the plan submission function (the `handleCreate` or equivalent function that calls `setDoc` to create the plan). At the very start of that function, before any validation, add:

```typescript
// Enforce free tier plan limit
if (!isPro) {
  const q = query(
    collection(db, 'plans'),
    where('createdBy', '==', uid),
    where('status', 'in', ['pending', 'confirmed'])
  );
  const snap = await getDocs(q);
  if (isAtPlanLimit(snap.size, 'free')) {
    setShowPaywall(true);
    return;
  }
}
```

- [ ] **Step 4: Add `PaywallModal` to the JSX**

At the bottom of the returned JSX, before the final closing tag, add:

```tsx
<PaywallModal
  visible={showPaywall}
  onClose={() => setShowPaywall(false)}
  reason="You've reached your 3-plan limit on the free tier."
/>
```

- [ ] **Step 5: Commit**

```bash
git add app/create-plan.tsx
git commit -m "feat: enforce 3-plan creation limit for free users"
```

---

## Task 8: Enforce Templates Limit

> **Depends on Task 7** — imports (`isAtTemplatesLimit`, `useSubscription`, `PaywallModal`), `isPro`, and `showPaywall`/`setShowPaywall` are already in place from Task 7. Do not re-add them.

**Files:**
- Modify: `app/create-plan.tsx`

Templates are saved to `users/{uid}.templates[]`. The save action (wherever it occurs in the file) needs a pre-check.

- [ ] **Step 1: Find the save-template action in `app/create-plan.tsx`**

Search for `arrayUnion` or `updateDoc` calls that write to the `templates` field. It will look something like:

```typescript
await updateDoc(userRef, { templates: arrayUnion(newTemplate) });
```

- [ ] **Step 2: Add the limit check before that `updateDoc` call**

Wrap the save action with:

```typescript
if (isAtTemplatesLimit(templates.length, isPro ? 'pro' : 'free')) {
  setShowPaywall(true);
  return;
}
// existing: await updateDoc(userRef, { templates: arrayUnion(newTemplate) });
```

Note: `templates` is already in state from `useState<any[]>([])` loaded at mount — use its `.length` directly.

- [ ] **Step 3: Commit**

```bash
git add app/create-plan.tsx
git commit -m "feat: enforce 2-template limit for free users"
```

---

## Task 9: Enforce Moments Upload Limit

**Files:**
- Modify: `app/plan-detail.tsx`

Moments are uploaded to the `plans/{planId}/moments` subcollection. The upload action must check the current count first.

- [ ] **Step 1: Add imports to `app/plan-detail.tsx`**

```typescript
import { getDocs, collection as fsCollection } from 'firebase/firestore';
import { isAtMomentsLimit } from '../lib/subscription';
import { useSubscription } from '../hooks/useSubscription';
import PaywallModal from '../components/PaywallModal';
```

- [ ] **Step 2: Add hook + paywall state inside the component**

```typescript
const { isPro } = useSubscription();
const [showPaywall, setShowPaywall] = useState(false);
```

- [ ] **Step 3: Add limit check in the moments upload handler**

Find the function that uploads a moment (it calls `expo-image-picker` then uploads to Firebase Storage). At the start of that function:

```typescript
// Enforce free tier moments limit
if (!isPro) {
  const snap = await getDocs(fsCollection(db, 'plans', planId, 'moments'));
  if (isAtMomentsLimit(snap.size, 'free')) {
    setShowPaywall(true);
    return;
  }
}
```

- [ ] **Step 4: Add `PaywallModal` to the JSX**

```tsx
<PaywallModal
  visible={showPaywall}
  onClose={() => setShowPaywall(false)}
  reason="You've reached 10 moments on the free tier."
/>
```

- [ ] **Step 5: Commit**

```bash
git add app/plan-detail.tsx
git commit -m "feat: enforce 10-moments limit for free users"
```

---

## Task 10: Enforce Chat History Limit

**Files:**
- Modify: `app/chat.tsx`

Free users see messages from the last 30 days only. The change is a conditional `where` clause on the existing Firestore query.

- [ ] **Step 1: Add imports to `app/chat.tsx`**

```typescript
import { Timestamp, where } from 'firebase/firestore';
import { getChatHistoryCutoff } from '../lib/subscription';
import { useSubscription } from '../hooks/useSubscription';
```

- [ ] **Step 2: Add hook inside the component**

```typescript
const { isPro } = useSubscription();
```

- [ ] **Step 3: Find the existing messages query**

It is at approximately `app/chat.tsx:227`:

```typescript
const q = query(
  collection(db, 'chats', ROOM_ID, 'messages'),
  orderBy('timestamp', 'asc'),
  limit(100)
);
```

- [ ] **Step 4: Replace with a subscription-aware query**

```typescript
const cutoff = getChatHistoryCutoff(isPro ? 'pro' : 'free');
const q = cutoff
  ? query(
      collection(db, 'chats', ROOM_ID, 'messages'),
      where('timestamp', '>=', Timestamp.fromDate(cutoff)),
      orderBy('timestamp', 'asc'),
      limit(100)
    )
  : query(
      collection(db, 'chats', ROOM_ID, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(200)
    );
```

Note: Firestore requires a composite index for `where` + `orderBy` on different fields. After deploying, Firestore will surface an error in the console with a link to create the index — follow that link.

- [ ] **Step 5: Commit**

```bash
git add app/chat.tsx
git commit -m "feat: enforce 30-day chat history for free users"
```

---

## Task 11: Subscription UI in Settings

**Files:**
- Modify: `app/settings.tsx`

Add a "Subscription" section that shows current tier, upgrade CTA (free users), and manage subscription link (pro users).

- [ ] **Step 1: Add imports to `app/settings.tsx`**

```typescript
import { Linking } from 'react-native';
import { useSubscription } from '../hooks/useSubscription';
import PaywallModal from '../components/PaywallModal';
```

- [ ] **Step 2: Add hook + paywall state inside `SettingsScreen`**

```typescript
const { isPro } = useSubscription();
const [showPaywall, setShowPaywall] = useState(false);
```

- [ ] **Step 3: Add Subscription section to the ScrollView**

Find the section headings in `settings.tsx` (e.g. "Account", "Privacy"). Add a new section before or after "Account":

```tsx
{/* Subscription */}
<Text style={styles.sectionHeader}>Subscription</Text>
<View style={styles.section}>
  <View style={styles.row}>
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>Current plan</Text>
      <Text style={[styles.value, isPro && { color: Colors.primary }]}>
        {isPro ? 'Quorum Pro' : 'Free'}
      </Text>
    </View>
    {!isPro && (
      <TouchableOpacity
        style={styles.upgradeBadge}
        onPress={() => setShowPaywall(true)}
      >
        <Text style={styles.upgradeBadgeText}>Upgrade</Text>
      </TouchableOpacity>
    )}
  </View>
  {isPro && (
    <TouchableOpacity
      style={styles.row}
      onPress={() =>
        Linking.openURL(
          Platform.OS === 'ios'
            ? 'https://apps.apple.com/account/subscriptions'
            : 'https://play.google.com/store/account/subscriptions'
        )
      }
    >
      <Text style={styles.label}>Manage subscription</Text>
      <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  )}
</View>
```

Add to `StyleSheet.create`:

```typescript
upgradeBadge: {
  backgroundColor: Colors.primary,
  borderRadius: Radius.full,
  paddingHorizontal: 14,
  paddingVertical: 6,
},
upgradeBadgeText: {
  color: '#fff',
  fontSize: FontSize.sm,
  fontWeight: FontWeight.bold as any,
},
value: {
  color: Colors.textMuted,
  fontSize: FontSize.sm,
  marginTop: 2,
},
```

- [ ] **Step 4: Add `PaywallModal` to the JSX**

```tsx
<PaywallModal
  visible={showPaywall}
  onClose={() => setShowPaywall(false)}
/>
```

- [ ] **Step 5: Add `Platform` to the existing import from `react-native` at the top of the file**

- [ ] **Step 6: Commit**

```bash
git add app/settings.tsx
git commit -m "feat: add subscription status + upgrade CTA to settings"
```

---

## Task 12: End-to-End Verification

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: All 8 tests in `__tests__/subscription.test.ts` passing.

- [ ] **Step 2: Build a dev client and test on a simulator**

```bash
npx expo prebuild
npx expo run:ios   # or expo run:android
```

- [ ] **Step 3: Manual free-tier smoke test**

1. Create 3 plans → 4th attempt should show PaywallModal.
2. Upload 10 moments to a plan → 11th attempt should show PaywallModal.
3. Open chat on a plan with messages older than 30 days → old messages should not appear.
4. Open Settings → should show "Free" plan with "Upgrade" badge.

- [ ] **Step 4: Manual pro-tier smoke test (RevenueCat sandbox)**

1. Configure a sandbox test account in App Store Connect / Google Play Console.
2. Purchase `quorum_pro_monthly` through the paywall.
3. Verify `subscriptionTier` updates to `'pro'` in Firestore.
4. Verify all limits are lifted.
5. Open Settings → should show "Quorum Pro" with "Manage subscription" link.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: Quorum Pro Phase 1 — free tier limits + subscription paywall"
```

---

## Out of Scope (Phase 2 / 3)

The following are explicitly deferred to separate plans:
- HD moments compression differential (Pro vs Free quality)
- Custom cover photo uploads (Pro only)
- Plan analytics screen
- Creator tier (promoted plans, recurring plans, RSVP export)
- B2B venue listings and sponsored plans
- RevenueCat webhook → Firebase Cloud Function for server-side subscription sync
