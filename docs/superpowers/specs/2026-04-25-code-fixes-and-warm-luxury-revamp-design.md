# Code Fixes + Warm Luxury Revamp — Design Spec

**Date:** 2026-04-25  
**Scope:** Two sequential work items: targeted render/subscription fixes, then full Warm Luxury visual overhaul.

---

## Part 1 — Code Quality Fixes

Four surgical changes with no behavior changes.

### Fix 1: Stable `plansQuery` in `discover.tsx`

**File:** `app/(tabs)/discover.tsx`  
**Problem:** `plansQuery` is constructed at component scope (lines 116–123), so it's a new object on every render. This causes the `useEffect` that uses it as a closure to silently re-subscribe on every render.  
**Fix:** Wrap in `useMemo` with `[]` deps (the query params never change).

```typescript
const plansQuery = useMemo(() => query(
  collection(db, 'plans'),
  where('isPublic', '==', true),
  where('status', 'in', ['pending', 'confirmed']),
  orderBy('createdAt', 'desc'),
  limit(50)
), []);
```

### Fix 2: `renderItem` `useCallback` in `discover.tsx`

**File:** `app/(tabs)/discover.tsx`  
**Problem:** `renderItem` is an inline arrow function — FlatList gets a new function reference every render, defeating `removeClippedSubviews` and causing unnecessary item re-renders.  
**Fix:** Extract to `useCallback` with deps `[uid, router, joiningId, userCoords]`.

### Fix 3: Merge dual `onAuthStateChanged` subscriptions in `index.tsx`

**File:** `app/(tabs)/index.tsx`  
**Problem:** Two separate `onAuthStateChanged` listeners — one sets `uid`, one sets `displayName`. Each registers a Firestore listener and a JS callback. One is sufficient.  
**Fix:** Single `useEffect` with one `onAuthStateChanged` call that sets both `uid` and `displayName` from the user object.

### Fix 4: Stabilize `isArchivedForMe`/`isPinnedForMe` in `index.tsx`

**File:** `app/(tabs)/index.tsx`  
**Problem:** `isArchivedForMe` and `isPinnedForMe` are inline functions called inside the `filteredPlans` `useMemo`. Since they're recreated each render, the `useMemo` dep array either omits them (stale closure) or includes them as unstable refs (defeats memoization).  
**Fix:** Wrap both in `useCallback` with `[uid]` dep, then include them in the `filteredPlans` `useMemo` dep array.

---

## Part 2 — Warm Luxury UI Revamp

Full spec already written. See:  
`docs/superpowers/specs/2026-04-24-warm-luxury-revamp-design.md`

Implementation order:

1. `lib/theme.ts` — color token swap + `Shadow.amberStrong`
2. `components/PlanCard.tsx` — new component (full-bleed banner)
3. `components/GlassCard.tsx` — remove hardcoded rose values
4. `components/AnimatedButton.tsx` — amber gradient for primary variant
5. `components/CategoryPill.tsx` — amber active state via tokens
6. `components/QuorumProgressBar.tsx` — amber gradient via tokens
7. `components/Toast.tsx` — amber info state via tokens
8. `app/(tabs)/_layout.tsx` — amber tab bar border + create button shadow
9. `app/(tabs)/index.tsx` — swap GlassCard plan renders → PlanCard; amber swipe actions
10. `app/(tabs)/discover.tsx` — swap plan card renders → PlanCard
11. `app/plan-detail.tsx` — PlanCard-style cover banner; amber vote/join buttons
12. `app/create-plan.tsx` — amber inputs/toggles via tokens
13. `app/(tabs)/profile.tsx` — amber hero gradient + avatar ring via tokens
14. `app/(tabs)/activity.tsx` — amber icon circles via tokens
15. `app/chat.tsx` — amber own-message bubble + send button
16. `app/social.tsx` — amber buttons via tokens
17. `app/settings.tsx` — amber toggles via tokens
18. `app/(auth)/login.tsx` — amber logo, inputs, password strength bar
19. `app/user-profile.tsx` — amber add-friend button via tokens

---

## Out of Scope

- Firebase schema or rule changes
- New screens or navigation changes
- Feature additions
