# Go Fully Free — Design Spec

**Date:** 2026-09-12
**Status:** Decisions locked (Ahmed, 2026-09-12). Ready for user spec-review, then implementation plan.
**Scope:** Remove all paid gating from Quorum. Every current Pro feature becomes free for everyone. Retire the paywall. Independent of the Places/Map feature (they can ship in either order).

---

## 1. Motivation

Quorum is going **fully free** on philosophy grounds — coordinating with friends shouldn't cost anyone. Future revenue comes from venues (referrals / sponsored options), never users (see the Places spec). So the entire subscription apparatus — RevenueCat, the paywall, and every `isPro` gate — should stop restricting anything.

Ahmed's call (2026-09-12): **"rip it out and put all the Pro features on free."**

## 2. What's gated today (verified in code)

`isPro` from `hooks/useSubscription.ts` currently gates:

| Where | Gate | Free today | Becomes |
|---|---|---|---|
| `create-plan.tsx` | active-plan limit (`isAtPlanLimit`) | 3 plans | unlimited |
| `chat.tsx` | chat history window | 30 days | full history |
| `plan-detail.tsx` | moments per plan (`isAtMomentsLimit`) | 10 | unlimited |
| `plan-detail.tsx` | saved templates (`isAtTemplatesLimit`) | 2 | unlimited |
| `profile.tsx` / `customize-profile.tsx` | profile customization (GIF pfp/banner, tagline, colors, longer bio) | locked | unlocked |
| `ThemePicker.tsx` | AMOLED + colored themes (`meta.pro`) | Light/Midnight only | all themes |
| `settings.tsx` | "Upgrade to Pro" row + plan status | shows upsell | removed |

Plus supporting machinery: `components/PaywallModal.tsx`, `lib/subscription.ts` (limits + RC keys + ZAR pricing), `hooks/useSubscription.ts`, RevenueCat (`react-native-purchases`, `Purchases.logIn` in `_layout.tsx`), the `revenuecatWebhook` Cloud Function, and the **`proCustomFields()` gate in `firestore.rules`**.

## 3. Approach — two phases (chosen)

Do the **functional unlock first** (small, safe, ships with the beta), then a **cleanup purge** later (removes dead code/deps). This avoids destabilizing the current build by deleting a web of modules mid-beta.

### Phase 1 — Functional unlock (ship with beta)

1. **Flip `isPro` to always true** at the single source, `hooks/useSubscription.ts`. Every `if (!isPro)` gate opens; every `isPro ? 'pro' : 'free'` call resolves to `'pro'` → unlimited limits, full chat history, all themes, all customization. One change, whole app goes free.
2. **Remove paywall entry points** so nothing tries to sell:
   - `settings.tsx` — drop the "Upgrade to Pro" row / plan-status upsell (or show a neutral "Everything's free" line).
   - `create-plan.tsx`, `plan-detail.tsx`, `profile.tsx`, `customize-profile.tsx` — remove `PaywallModal` mounts + the code paths that open it (they become unreachable once `isPro` is always true, but remove them so no dead modal can render).
3. **Relax + redeploy the Firestore rule (REQUIRED — the gotcha).** `firestore.rules` `proCustomFields()` currently allows the Pro profile fields (avatarGifUrl/avatarStillUrl/bannerGifUrl/bannerStillUrl/decorationId/tagline/profileAccent/nameColor) to be written **only when `subscriptionTier == 'pro'`**. With everyone effectively Pro in the app but still `'free'` in Firestore, these writes would be **DENIED** and profile customization would silently fail. Fix: drop the `subscriptionTier == 'pro'` condition so any authenticated owner can write those fields (they stay owner-only + validated otherwise). **Must `firebase deploy --only firestore:rules`** or customization breaks in production.
4. **Keep RevenueCat plumbing dormant but harmless** for now (no purchases can be triggered because nothing opens the paywall). `Purchases.logIn` in `_layout.tsx` stays; it's inert.

Verification for Phase 1: tsc clean; jest green; `npm run test:rules` updated for the relaxed rule; on-device — create >3 plans, open all themes, save a customized profile as a brand-new (free) account, confirm no paywall appears anywhere.

### Phase 2 — Cleanup purge (post-beta, low priority)

Once the free model is confirmed and stable, delete the dead apparatus:
- Remove `react-native-purchases` dep + `Purchases.*` calls in `_layout.tsx`.
- Delete `components/PaywallModal.tsx`, prune `lib/subscription.ts` to just the (now-constant) limit helpers or remove them, simplify `hooks/useSubscription.ts` to a constant or delete it and its imports.
- Remove the `revenuecatWebhook` Cloud Function + its secret + `firebase.json` wiring; redeploy functions.
- Remove the ZAR-pricing code path in `PaywallModal` (dies with the file).
- Drop `proCustomFields()` entirely from rules if no longer referenced; redeploy.
- Update paywall copy / store listing (no subscriptions).

Phase 2 is pure hygiene — no user-visible change beyond a smaller app. Sequenced after beta so the removal never blocks a build.

## 4. Non-Goals

- No refunds/migration logic — there are no real paying subscribers yet (products were never fully live; test grants only).
- Not touching the *features* themselves (themes, customization, moments, templates) — only their gates.
- Store-side subscription products can be left unpublished/ignored; no need to actively tear them down for launch.

## 5. Risks / Notes

- **The rules redeploy is the one true dependency** — miss it and customization saves fail for everyone. It's step 3, called out loudly.
- Existing test accounts with `subscriptionTier == 'pro'` keep working (they're a superset). New free accounts get everything via the `isPro=true` flip.
- If Ahmed ever wants to reintroduce a paid tier, Phase 1 is trivially reversible (un-flip `isPro`); Phase 2 is not — so Phase 2 is the real commitment to "free forever." Worth a conscious go-ahead before doing Phase 2.

## 6. Build Sequence

1. `hooks/useSubscription.ts` → `isPro` always true (+ unit test).
2. Relax `proCustomFields()` in `firestore.rules` + update `rules-test/test.js`; run emulator; **deploy rules**.
3. Strip paywall mounts/entry points from the 5 screens + settings upsell.
4. Verify (tsc / jest / rules / on-device free-account walkthrough).
5. (Later, explicit go-ahead) Phase 2 dependency + dead-code purge.
