# Go Fully Free (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every current Pro feature free for all users and remove the paywall, without destabilizing the beta build.

**Architecture:** Route the entitlement decision through a single pure flag (`ALL_FEATURES_FREE`) in `lib/subscription.ts` so `isPro` is always true and every usage limit is disabled at the source. Relax the one Firestore rule that would otherwise reject profile-customization writes from "free" accounts, and strip the now-unreachable paywall UI from the six screens that mount it. RevenueCat plumbing is left dormant (removed later in Phase 2, which is out of scope here).

**Tech Stack:** TypeScript, Expo/React Native, Firebase (Firestore rules), Jest (`jest-expo`), Firestore rules emulator (`npm run test:rules`).

**Scope note:** This is **Phase 1 only** — the functional unlock. Phase 2 (deleting `react-native-purchases`, `PaywallModal.tsx`, `revenuecatWebhook`, the ZAR-pricing path, and the now-unused rule helper) is deferred and requires an explicit separate go-ahead per the spec (it's the irreversible commitment to "free forever").

---

## Task 1: Disable usage limits at the source

**Files:**
- Modify: `lib/subscription.ts`
- Test: `__tests__/subscription.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these cases to `__tests__/subscription.test.ts` (append inside the existing top-level `describe`, or add a new `describe('everything free', ...)`):

```ts
import {
  ALL_FEATURES_FREE,
  computeIsPro,
  isAtPlanLimit,
  isAtMomentsLimit,
  isAtTemplatesLimit,
  getChatHistoryCutoff,
} from '../lib/subscription';

describe('everything free', () => {
  it('flag is on', () => {
    expect(ALL_FEATURES_FREE).toBe(true);
  });

  it('computeIsPro is true even for a free tier', () => {
    expect(computeIsPro('free')).toBe(true);
    expect(computeIsPro('pro')).toBe(true);
  });

  it('no plan/moments/templates limit for free users', () => {
    expect(isAtPlanLimit(999, 'free')).toBe(false);
    expect(isAtMomentsLimit(999, 'free')).toBe(false);
    expect(isAtTemplatesLimit(999, 'free')).toBe(false);
  });

  it('free users get full chat history (no cutoff)', () => {
    expect(getChatHistoryCutoff('free')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/subscription.test.ts`
Expected: FAIL — `ALL_FEATURES_FREE`/`computeIsPro` are not exported yet; the limit assertions currently return `true`.

- [ ] **Step 3: Implement — make the flag disable all limits**

Edit `lib/subscription.ts`. Add the flag + helper near the top (after the `FREE_LIMITS` block) and make every limit helper honor it:

```ts
// Quorum is fully free: every account gets all former Pro features.
// This single flag disables all usage limits and forces `isPro` true.
// (Phase 2 will delete the RevenueCat apparatus entirely.)
export const ALL_FEATURES_FREE = true;

export function computeIsPro(tier: SubscriptionTier): boolean {
  return ALL_FEATURES_FREE || tier === 'pro';
}
```

Then change each guard so the free flag short-circuits it:

```ts
export function isAtPlanLimit(activePlanCount: number, tier: SubscriptionTier): boolean {
  if (ALL_FEATURES_FREE || tier === 'pro') return false;
  return activePlanCount >= FREE_LIMITS.activePlans;
}

export function isAtMomentsLimit(momentsCount: number, tier: SubscriptionTier): boolean {
  if (ALL_FEATURES_FREE || tier === 'pro') return false;
  return momentsCount >= FREE_LIMITS.momentsPerPlan;
}

export function isAtTemplatesLimit(templateCount: number, tier: SubscriptionTier): boolean {
  if (ALL_FEATURES_FREE || tier === 'pro') return false;
  return templateCount >= FREE_LIMITS.templates;
}

export function getChatHistoryCutoff(tier: SubscriptionTier): Date | null {
  if (ALL_FEATURES_FREE || tier === 'pro') return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FREE_LIMITS.chatHistoryDays);
  return cutoff;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/subscription.test.ts`
Expected: PASS (new cases green; existing cases still green — the old tests asserted `pro` returns false, which still holds).

- [ ] **Step 5: Commit**

```bash
git add lib/subscription.ts __tests__/subscription.test.ts
git commit -m "feat(free): disable all usage limits via ALL_FEATURES_FREE flag"
```

---

## Task 2: Force `isPro` true in the subscription hook

**Files:**
- Modify: `hooks/useSubscription.ts`

- [ ] **Step 1: Implement — return the computed value**

In `hooks/useSubscription.ts`, import the helper and use it for `isPro`. Change the import line:

```ts
import { SubscriptionTier, computeIsPro } from '../lib/subscription';
```

and change the return statement at the end of the hook:

```ts
  return { tier, isPro: computeIsPro(tier), loading };
```

(Leave the Firestore listener in place — it's now inert but harmless; Phase 2 removes it. `tier` still reflects the real doc value for any display code, but `isPro` is always true.)

- [ ] **Step 2: Verify types + existing tests still pass**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS — tsc clean; the full suite green (no test asserted `isPro` false for a free account).

- [ ] **Step 3: Commit**

```bash
git add hooks/useSubscription.ts
git commit -m "feat(free): useSubscription always returns isPro=true"
```

---

## Task 3: Relax the Firestore customization rule (the critical gotcha)

Without this, "free" accounts (which is now everyone in Firestore) are **denied** when saving Pro profile fields, so customization silently breaks. We drop the `subscriptionTier == 'pro'` condition; the fields stay owner-only and entitlement fields stay locked.

**Files:**
- Modify: `firestore.rules:35-57` (the `/users/{uid}` `allow update` owner branch)
- Modify: `firestore.rules:19-22` (remove the now-unused `proCustomFields()` helper — optional but clean)
- Test: `rules-test/test.js`

- [ ] **Step 1: Update the rule tests to the new expectation (write failing tests first)**

In `rules-test/test.js`, change the two "free owner CANNOT…" cases (currently ~lines 108–113) to succeed, and keep the entitlement guards. Replace:

```js
  await check('free owner CANNOT set nameColor',
    assertFails(updateDoc(doc(alice, 'users/alice'), { nameColor: 'crimson' })));

  await check('free owner CANNOT set tagline',
    assertFails(updateDoc(doc(alice, 'users/alice'), { tagline: 'hi' })));
```

with:

```js
  await check('free owner CAN set nameColor (everything free)',
    assertSucceeds(updateDoc(doc(alice, 'users/alice'), { nameColor: 'crimson' })));

  await check('free owner CAN set tagline (everything free)',
    assertSucceeds(updateDoc(doc(alice, 'users/alice'), { tagline: 'hi' })));
```

Leave every `subscriptionTier` self-assign check (lines ~92–103, ~125, ~269) unchanged — those must still fail.

- [ ] **Step 2: Run rules tests to verify the two flipped cases fail against the current rule**

Run: `npm run test:rules`
Expected: FAIL on the two flipped cases (current rule still blocks free owners from writing `nameColor`/`tagline`).

> Emulator needs JDK 21. If `java` is JDK 8, set for this shell:
> `export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot"` and prepend `"$JAVA_HOME/bin"` to `PATH`.

- [ ] **Step 3: Implement — drop the Pro gate from the owner-update branch**

In `firestore.rules`, replace the owner branch (lines 37–48):

```
        (
          request.auth.uid == uid &&
          !request.resource.data.diff(resource.data)
            .affectedKeys()
            .hasAny(lockedEntitlementFields()) &&
          (
            resource.data.get('subscriptionTier', 'free') == 'pro' ||
            !request.resource.data.diff(resource.data)
              .affectedKeys()
              .hasAny(proCustomFields())
          )
        ) ||
```

with:

```
        (
          request.auth.uid == uid &&
          !request.resource.data.diff(resource.data)
            .affectedKeys()
            .hasAny(lockedEntitlementFields())
        ) ||
```

Then delete the now-unused helper (lines 18–22):

```
    // Visual customization fields that require an active Pro subscription to change.
    function proCustomFields() {
      return ['avatarGifUrl', 'avatarStillUrl', 'bannerGifUrl', 'bannerStillUrl',
              'decorationId', 'tagline', 'profileAccent', 'nameColor'];
    }
```

(Keep `lockedEntitlementFields()` — `subscriptionTier` etc. must still be Admin-SDK-only.)

- [ ] **Step 4: Run rules tests to verify all pass**

Run: `npm run test:rules`
Expected: PASS — the two flipped cases now succeed; all `subscriptionTier` self-assign cases still fail; total count green.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules rules-test/test.js
git commit -m "feat(free): allow all owners to write profile customization fields"
```

- [ ] **Step 6: Deploy the rules (REQUIRED, human/CLI)**

The app change is useless — and customization will fail in production — until the rule is live.

Run: `firebase deploy --only firestore:rules`
Expected: "released rules firestore.rules" for project `quorum-323e1`.
(If the CLI needs reauth, the user runs `! firebase login` in the session first.)

---

## Task 4: Remove the paywall entry points from the six screens

Every gate now no-ops (isPro always true, limits always false), so the `PaywallModal` mounts and their triggers are dead code that could still theoretically render. Remove them screen by screen. After each edit run `npx tsc --noEmit` to catch an orphaned import/variable.

**Files (all Modify):**
- `app/create-plan.tsx`
- `app/(tabs)/profile.tsx`
- `app/customize-profile.tsx`
- `app/plan-detail.tsx`
- `app/settings.tsx`
- `components/ThemePicker.tsx`

- [ ] **Step 1: `create-plan.tsx` — remove the plan-limit check + paywall**

  1. Delete the whole `if (!isPro) { … isAtPlanLimit … setShowPaywall(true) … }` block in `handleCreate` (currently lines ~150–166).
  2. Delete the `<PaywallModal … />` element (~line 799) and its `showPaywall`/`setShowPaywall` state + `useSubscription`/`isAtPlanLimit`/`PaywallModal` imports if now unused.
  3. Keep everything else (moderation, celebration, etc.) intact.

- [ ] **Step 2: `settings.tsx` — remove the upgrade row + paywall**

  1. Remove the `{!isPro && ( … Upgrade … )}` block (~line 245) and the Pro/Free plan-status display (~lines 236–259). Optionally replace with nothing (cleanest) — do not add new copy.
  2. Remove `<PaywallModal … />` (~line 392) and `showPaywall`/`closePaywall` state + `useSubscription`/`PaywallModal` imports if unused.

- [ ] **Step 3: `plan-detail.tsx` — remove moments/templates paywall**

  1. The `isAtMomentsLimit(...)`/`isAtTemplatesLimit(...)` calls now always return false; remove the `if (…) { setShowPaywall(true); return; }` guards around them (~lines 444, 496) so the action proceeds directly.
  2. Remove `<PaywallModal … />` (~line 1537) + its state + unused imports.

- [ ] **Step 4: `profile.tsx` — unlock customization branches**

  1. Where `if (!isPro) { openPaywall(); return; }` guards gate avatar/customization actions (~lines 398, 410), remove the guard so the action runs for everyone.
  2. `bioMaxFor(isPro)` and `isPro ? {...} : {}` (~lines 334, 845) now always take the Pro branch — leave them (they read correctly with isPro=true) OR simplify to the Pro values. Minimal change: leave as-is.
  3. Remove `<PaywallModal … />` (~line 940) + unused `PaywallModal` import. Keep `useSubscription` only if `isPro` is still referenced.

- [ ] **Step 5: `customize-profile.tsx` — Apply always persists**

  1. In the Apply handler, remove the `if (!isPro) { open paywall; return; }` branch (~line 64) so Apply always saves.
  2. Change the button label (~line 127) from `{isPro ? 'Apply changes' : 'Unlock with Pro'}` to a constant `'Apply changes'`.
  3. Remove `<PaywallModal … />` (~line 132) + unused imports.

- [ ] **Step 6: `ThemePicker.tsx` — all themes unlocked**

  Change the lock computation (~line 30) from:

  ```ts
  const locked = meta.pro && !isPro;
  ```

  to:

  ```ts
  const locked = false;
  ```

  Remove the `useSubscription` import/usage if `isPro` is now unused. (Leaving `meta.pro` in the theme metadata is fine — it's just no longer gating.)

- [ ] **Step 7: Verify no paywall UI remains and everything compiles**

Run:
```bash
npx tsc --noEmit
npx jest
grep -rn "PaywallModal\|setShowPaywall\|showPaywall" app components | grep -v node_modules
```
Expected: tsc clean; jest green; the grep returns **no matches** (every paywall mount/trigger removed). If a screen kept `useSubscription` only for a now-unused `isPro`, remove that too.

- [ ] **Step 8: Commit**

```bash
git add app components
git commit -m "feat(free): remove paywall entry points from all screens"
```

---

## Task 5: Full verification & on-device walkthrough

- [ ] **Step 1: Automated gate**

Run:
```bash
npx tsc --noEmit && npx jest && npm run test:rules
```
Expected: tsc clean; full jest suite green; rules suite green.

- [ ] **Step 2: On-device / Expo Go walkthrough with a brand-new (free) account**

Verify none of these show a paywall and all succeed:
  - Create 4+ active plans (was capped at 3).
  - Open Settings → Appearance → every theme selectable (AMOLED/colored no longer locked).
  - Customize profile: set a GIF avatar/banner, tagline, name color, accent → **Apply saves without error** (this exercises the deployed rule — if it errors with permission-denied, Task 3 Step 6 wasn't deployed).
  - Add 11+ moments to a plan; save 3+ templates — no block.
  - Confirm Settings shows no "Upgrade to Pro" upsell.

- [ ] **Step 3: Record the result**

If anything shows a paywall or a save fails, note which screen and fix the corresponding Task 4 step (or re-check the rules deploy). Otherwise the functional unlock is complete.

---

## Deferred to Phase 2 (separate go-ahead required)

Not in this plan — do NOT do these now:
- Remove `react-native-purchases` dependency + `Purchases.logIn/logOut` in `app/_layout.tsx`.
- Delete `components/PaywallModal.tsx`, prune/remove `lib/subscription.ts` RC keys + product IDs, simplify/remove `hooks/useSubscription.ts`.
- Remove the `revenuecatWebhook` Cloud Function + its secret + `firebase.json` wiring; redeploy functions.
- Remove `lockedEntitlementFields()` only if `subscriptionTier` truly becomes unused (likely keep as defense-in-depth).
- Update store listing / remove subscription products.

These are the irreversible commitment to "free forever" — confirm with the user before starting.
