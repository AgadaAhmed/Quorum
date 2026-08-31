# Plan Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove user-uploaded plan cover photos and replace every cover render site with a generated, deterministic monochrome `PlanBanner` (category icon on a dark greyscale gradient), eliminating the image-moderation problem.

**Architecture:** One new pure-presentational component `components/PlanBanner.tsx` (no network, no state, no text) fills each old cover slot. Existing overlays (badges, floating header, scrims) and the surrounding title/category text stay unchanged. The cover-upload flow is deleted from `create-plan.tsx`; legacy `coverUrl` values are simply never read.

**Tech Stack:** React Native / Expo, TypeScript, `expo-linear-gradient` (installed), `@expo/vector-icons` (Ionicons), Jest + `@testing-library/react-native`.

**Design rules (hard):** strictly monochrome (black/white/grey, no hue); **no emoji** in any string — category glyphs are Ionicons vector icons, not emoji.

---

## File Structure

- **Create** `components/PlanBanner.tsx` — the banner component + `hashSeed` helper + `CATEGORY_ICONS` map. Single responsibility: render a decorative category graphic for a given variant.
- **Create** `__tests__/ui/PlanBanner.test.tsx` — unit tests for the component + helper.
- **Modify** `components/home/SwipeablePlanCard.tsx` — swap cover Image/placeholder → `<PlanBanner variant="card" />`.
- **Modify** `app/(tabs)/discover.tsx` — swap cover Image/placeholder → `<PlanBanner variant="card" />`.
- **Modify** `app/plan-detail.tsx` — hero cover → `<PlanBanner variant="hero" />`; delete the redundant inline overview cover.
- **Modify** `app/(tabs)/profile.tsx` — plan-row thumbnail → `<PlanBanner variant="thumb" />`.
- **Modify** `app/create-plan.tsx` — delete the entire cover-photo pick/upload flow.
- **Modify** `storage.rules` — lock `plan-covers/{planId}` writes to `false`.

---

## Task 1: PlanBanner component + hashSeed

**Files:**
- Create: `components/PlanBanner.tsx`
- Test: `__tests__/ui/PlanBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/PlanBanner.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PlanBanner, { hashSeed } from '../../components/PlanBanner';

describe('PlanBanner', () => {
  it('renders a banner labelled by category', () => {
    render(<PlanBanner category="Music" seed="plan1" variant="card" />);
    expect(screen.getByLabelText('Music cover')).toBeOnTheScreen();
  });

  it('falls back to a generic label when category is missing', () => {
    render(<PlanBanner seed="plan2" variant="card" />);
    expect(screen.getByLabelText('Plan cover')).toBeOnTheScreen();
  });

  it('is decorative only — renders no category/title text', () => {
    render(<PlanBanner category="Food" seed="plan3" variant="hero" />);
    expect(screen.queryByText(/Food/)).toBeNull();
  });

  it('renders an unknown category without throwing (default icon)', () => {
    render(<PlanBanner category="Nonsense" seed="plan4" variant="thumb" />);
    expect(screen.getByLabelText('Nonsense cover')).toBeOnTheScreen();
  });

  it('hashSeed is deterministic and non-negative', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).toBeGreaterThanOrEqual(0);
  });

  it('hashSeed distributes across seeds', () => {
    const idxs = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((s) => hashSeed(s) % 6);
    expect(new Set(idxs).size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/ui/PlanBanner.test.tsx`
Expected: FAIL — `Cannot find module '../../components/PlanBanner'`.

- [ ] **Step 3: Write the component**

Create `components/PlanBanner.tsx`:

```tsx
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export type PlanBannerVariant = 'hero' | 'card' | 'thumb';

// Category -> Ionicon (vector glyphs, NOT emoji). Verify names exist in Ionicons.glyphMap.
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Music: 'musical-notes',
  Food: 'restaurant',
  Sports: 'basketball',
  Art: 'color-palette',
  Gaming: 'game-controller',
  Travel: 'airplane',
  Party: 'sparkles',
  Study: 'book',
};
const DEFAULT_ICON: keyof typeof Ionicons.glyphMap = 'calendar';

// Dark monochrome gradient from theme tokens: primary #000 -> primaryContainer #1b1b1b -> tertiary #1a1a1a.
const GRADIENT = ['#000000', '#1b1b1b', '#1a1a1a'] as const;

const PLACEMENTS = [
  { dx: 0, dy: 0, rotate: '0deg' },
  { dx: 14, dy: -8, rotate: '-8deg' },
  { dx: -16, dy: 10, rotate: '7deg' },
  { dx: 10, dy: 12, rotate: '11deg' },
  { dx: -12, dy: -12, rotate: '-6deg' },
  { dx: 18, dy: 6, rotate: '5deg' },
] as const;

const VARIANT: Record<
  PlanBannerVariant,
  { height: ViewStyle['height']; icon: number; opacity: number; gradient: boolean }
> = {
  hero: { height: 220, icon: 104, opacity: 0.18, gradient: true },
  card: { height: 176, icon: 84, opacity: 0.2, gradient: true },
  thumb: { height: '100%', icon: 24, opacity: 0.6, gradient: false },
};

// djb2 string hash -> non-negative int. Exported for tests.
export function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (((h << 5) + h) + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface PlanBannerProps {
  category?: string;
  seed: string;
  variant: PlanBannerVariant;
  style?: StyleProp<ViewStyle>;
}

export default function PlanBanner({ category, seed, variant, style }: PlanBannerProps) {
  const cfg = VARIANT[variant];
  const iconName = (category && CATEGORY_ICONS[category]) || DEFAULT_ICON;
  const place = PLACEMENTS[hashSeed(seed) % PLACEMENTS.length];

  return (
    <View
      testID="plan-banner"
      accessible
      accessibilityLabel={`${category ?? 'Plan'} cover`}
      style={[styles.base, { height: cfg.height }, style]}
    >
      {cfg.gradient ? (
        <LinearGradient
          colors={GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.flat]} />
      )}
      <View style={styles.center} pointerEvents="none">
        <Ionicons
          name={iconName}
          size={cfg.icon}
          color="#ffffff"
          style={{
            opacity: cfg.opacity,
            transform: [
              { translateX: place.dx },
              { translateY: place.dy },
              { rotate: place.rotate },
            ],
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { width: '100%', overflow: 'hidden', backgroundColor: '#141414' },
  flat: { backgroundColor: '#1a1a1a' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 4: Verify the Ionicons glyph names resolve**

Run:
```bash
node -e "const g=require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'); ['musical-notes','restaurant','basketball','color-palette','game-controller','airplane','sparkles','book','calendar'].forEach(n=>console.log(n, n in g ? 'ok':'MISSING'))"
```
Expected: every name prints `ok`. If any prints `MISSING`, pick the nearest existing name from that glyphmap (e.g. `musical-notes` vs `musical-note`) and update `CATEGORY_ICONS`/`DEFAULT_ICON`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/ui/PlanBanner.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add components/PlanBanner.tsx __tests__/ui/PlanBanner.test.tsx
git commit -m "feat(ui): add decorative monochrome PlanBanner component"
```

---

## Task 2: Home feed card (SwipeablePlanCard)

**Files:**
- Modify: `components/home/SwipeablePlanCard.tsx` (import line 2, cover block lines 161-168, unused style)

- [ ] **Step 1: Add the import**

At the top of `components/home/SwipeablePlanCard.tsx`, add after the `GlassCard` import (line 5):

```tsx
import PlanBanner from '../PlanBanner';
```

- [ ] **Step 2: Replace the cover block**

Replace lines 161-168 (the `coverUrl ? Image : placeholder` inside `coverWrap`):

```tsx
        <View style={styles.coverWrap}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="image-outline" size={28} color={Colors.textDisabled} />
            </View>
          )}
```

with:

```tsx
        <View style={styles.coverWrap}>
          <PlanBanner category={item.category} seed={item.id} variant="card" style={styles.coverImage} />
```

(Leave the rest of the `coverWrap` — badges, countdown, pinned — untouched.)

- [ ] **Step 3: Remove the now-unused `Image` import and `coverPlaceholder` style**

- Line 2: change `import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';` to `import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';`
- Delete the `coverPlaceholder: { ... }` style block (lines ~249-255). Keep `coverImage`.

- [ ] **Step 4: Verify no dangling references**

Run: `grep -nE "<Image|coverPlaceholder|coverUrl" components/home/SwipeablePlanCard.tsx`
Expected: no output.

- [ ] **Step 5: Run the card's test**

Run: `npx jest __tests__/ui/SwipeablePlanCard.test.tsx`
Expected: PASS (fixture has no `coverUrl`; title/category assertions come from the card body, unaffected).

- [ ] **Step 6: Commit**

```bash
git add components/home/SwipeablePlanCard.tsx
git commit -m "feat(ui): render PlanBanner on home plan cards"
```

---

## Task 3: Discover card

**Files:**
- Modify: `app/(tabs)/discover.tsx` (import, cover block lines 165-171, unused style)

- [ ] **Step 1: Add the import**

Add near the other imports at the top of `app/(tabs)/discover.tsx`:

```tsx
import PlanBanner from '../../components/PlanBanner';
```

- [ ] **Step 2: Replace the cover block**

Replace lines 165-171:

```tsx
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={styles.cardCover} />
        ) : (
          <View style={styles.cardCoverPlaceholder}>
            <Ionicons name="image-outline" size={28} color={Colors.textDisabled} />
          </View>
        )}
```

with:

```tsx
        <PlanBanner category={item.category} seed={item.id} variant="card" style={styles.cardCover} />
```

(Keep the `coverScrim` LinearGradient and the badge row that follow.)

- [ ] **Step 3: Remove the now-unused `cardCoverPlaceholder` style, and `Image` import if unused**

- Delete the `cardCoverPlaceholder: { ... }` style block (lines ~608-614).
- Run `grep -nE "<Image" app/(tabs)/discover.tsx`. If it prints nothing, remove `Image` from the `react-native` import line. If it still appears elsewhere, leave the import.

- [ ] **Step 4: Verify**

Run: `grep -nE "cardCoverPlaceholder|coverUrl" app/(tabs)/discover.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/discover.tsx
git commit -m "feat(ui): render PlanBanner on discover cards"
```

---

## Task 4: Plan detail (hero + delete redundant inline cover)

**Files:**
- Modify: `app/plan-detail.tsx` (import; hero lines 1396-1401; inline lines 743-745; `heroCoverPlaceholder` style)

- [ ] **Step 1: Add the import**

Add near the top imports of `app/plan-detail.tsx`:

```tsx
import PlanBanner from '../components/PlanBanner';
```

- [ ] **Step 2: Replace the hero cover**

Replace lines 1397-1401:

```tsx
          {plan.coverUrl ? (
            <Image source={{ uri: plan.coverUrl }} style={styles.heroCover} resizeMode="cover" />
          ) : (
            <View style={styles.heroCoverPlaceholder} />
          )}
```

with:

```tsx
          <PlanBanner category={plan.category} seed={plan.id} variant="hero" style={styles.heroCover} />
```

(Keep the `floatHeader` block that follows — it overlays the banner.)

- [ ] **Step 3: Delete the redundant inline overview cover**

The hero banner above already represents this plan; a second banner in the overview card is redundant. Delete lines 743-745 entirely:

```tsx
        {plan.coverUrl ? (
          <Image source={{ uri: plan.coverUrl }} style={styles.coverImage} resizeMode="cover" />
        ) : null}
```

(The `upcomingLabel` / `planTitle` / category tag directly below stay.)

- [ ] **Step 4: Remove the now-unused `heroCoverPlaceholder` style**

Delete the `heroCoverPlaceholder: { ... }` style line. Keep `heroCover` and `coverImage` (verify `coverImage` isn't referenced elsewhere first: `grep -nE "styles.coverImage" app/plan-detail.tsx` — if only the deleted line used it, remove `coverImage` too). Do **not** remove the `Image` import: it is still used for `photoThumb` (moments) around line 1183.

- [ ] **Step 5: Verify**

Run: `grep -nE "heroCoverPlaceholder|plan.coverUrl" app/plan-detail.tsx`
Expected: no output.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 7: Commit**

```bash
git add app/plan-detail.tsx
git commit -m "feat(ui): PlanBanner hero on plan detail; drop redundant inline cover"
```

---

## Task 5: Profile plan-row thumbnail

**Files:**
- Modify: `app/(tabs)/profile.tsx` (import; thumb block lines 133-139; unused placeholder style)

- [ ] **Step 1: Confirm the row's plan has `id` and `category`**

Run: `grep -nE "id:|category\??:|coverUrl" app/(tabs)/profile.tsx | head`
The plan-row's type must include `id: string` and `category?: string`. If `category` is absent from the row's plan type, add `category?: string;` to that type (near the existing `coverUrl?: string;` at line ~50).

- [ ] **Step 2: Add the import**

Add near the top imports of `app/(tabs)/profile.tsx`:

```tsx
import PlanBanner from '../../components/PlanBanner';
```

- [ ] **Step 3: Replace the thumbnail block**

Replace lines 133-139:

```tsx
      <View style={styles.planRowThumb}>
        {plan.coverUrl ? (
          <Image source={{ uri: plan.coverUrl }} style={styles.planRowThumbImage} />
        ) : (
          <View style={styles.planRowThumbPlaceholder} />
        )}
      </View>
```

with:

```tsx
      <View style={styles.planRowThumb}>
        <PlanBanner category={plan.category} seed={plan.id} variant="thumb" style={styles.planRowThumbImage} />
      </View>
```

- [ ] **Step 4: Remove unused style and (if applicable) `Image` import**

- Delete the `planRowThumbPlaceholder: { ... }` style block (lines ~1157+).
- Run `grep -nE "<Image" app/(tabs)/profile.tsx`. If nothing prints, remove `Image` from the `react-native` import; otherwise leave it.

- [ ] **Step 5: Verify + typecheck**

Run: `grep -nE "planRowThumbPlaceholder|plan.coverUrl" app/(tabs)/profile.tsx` → no output.
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/profile.tsx
git commit -m "feat(ui): PlanBanner thumbnail on profile plan rows"
```

---

## Task 6: Remove the cover-upload flow from create-plan

**Files:**
- Modify: `app/create-plan.tsx` (imports; state; handler; upload block; plan field; picker UI; styles)

- [ ] **Step 1: Delete the picker UI block**

Remove the entire Cover Photo picker block (lines ~381-410): the `Label text="Cover Photo (optional)"`, the `TouchableOpacity style={styles.coverPicker}` with its `coverUri ? preview : placeholder`, and the "Remove cover photo" action below it.

- [ ] **Step 2: Delete the upload logic in submit**

Remove the upload block inside the create handler (lines ~206-220):

```tsx
      let coverUrl: string | null = null;
      if (coverUri) {
        setUploadingCover(true);
        try {
          const response = await fetch(coverUri);
          const blob = await response.blob();
          const storageRef = ref(storage, `plan-covers/${planRef.id}`);
          await uploadBytes(storageRef, blob);
          coverUrl = await getDownloadURL(storageRef);
        } catch {
          // Cover upload failed — create plan without it.
        } finally {
          setUploadingCover(false);
        }
      }
```

And remove the `coverUrl,` field from the `setDoc(planRef, { ... })` object (line ~269).

- [ ] **Step 3: Delete the handler, state, and permission prompt**

- Remove `handlePickCover` (lines ~137-152) entirely.
- Remove state: `const [coverUri, setCoverUri] = useState<string | null>(null);` and `const [uploadingCover, setUploadingCover] = useState(false);` (lines ~58-59).
- Remove `coverUri` from the `useCallback` dependency array (line ~294).

- [ ] **Step 4: Fix the submit label**

Change the label (line ~340) from:

```tsx
  const submitLabel = uploadingCover ? 'Uploading photo...' : loading ? 'Creating...' : 'Create Plan';
```

to:

```tsx
  const submitLabel = loading ? 'Creating...' : 'Create Plan';
```

- [ ] **Step 5: Remove now-unused imports and styles**

- Remove `import * as ImagePicker from 'expo-image-picker';` (line 14).
- Remove `import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';` (line 20). Then `grep -nE "\bstorage\b" app/create-plan.tsx` — if `storage` from `../lib/firebase` is no longer used, remove it from that import too.
- Delete the cover styles: `coverPicker`, `coverPreview`, `coverEditBadge`, `coverEditBadgeText`, `coverPlaceholder`, `coverPlaceholderText`, `coverPlaceholderHint` (lines ~903-920).

- [ ] **Step 6: Verify nothing cover-related remains**

Run: `grep -niE "cover|ImagePicker|uploadBytes" app/create-plan.tsx`
Expected: no output.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Fix any "declared but never used" errors by removing the leftover symbol.)

- [ ] **Step 8: Commit**

```bash
git add app/create-plan.tsx
git commit -m "feat(plans): remove cover-photo upload flow"
```

---

## Task 7: Lock the `plan-covers` storage rule

**Files:**
- Modify: `storage.rules` (the `plan-covers/{planId}` match block)

- [ ] **Step 1: Change the write rule to false**

In `storage.rules`, replace the `plan-covers/{planId}` block's `allow write` (lines ~27-32) with a deny, keeping read for any lingering objects:

```
    // Plan covers are retired — no client uploads. Keep read for any legacy
    // objects; new writes are denied (covers are now generated client-side).
    match /plan-covers/{planId} {
      allow read: if isAuth();
      allow write: if false;
    }
```

- [ ] **Step 2: Run the storage rules tests**

Run: `npm run test:storage`
Expected: PASS (the avatar assertions still hold; the cover branch is now a hard deny). If a test asserted a successful cover write, update it to expect denial.

- [ ] **Step 3: Commit**

```bash
git add storage.rules
git commit -m "chore(rules): retire plan-covers storage writes"
```

> Deploy note (not part of this plan): `firebase deploy --only storage` when convenient. No client writes there remain, so it is non-urgent.

---

## Task 8: Full verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all suites pass — the previous 53 plus the 6 new `PlanBanner` tests (59 total), 0 failures.

- [ ] **Step 3: Manual smoke (device/Expo Go)**

Run `npx expo start`, then confirm visually:
- Home feed cards show a dark banner with the category icon (no more empty grey box / `image-outline`).
- Discover cards likewise; badges/scrim still legible on top.
- Plan detail shows the hero banner with the floating header on top; no second banner inside the overview card.
- Profile plan rows show the small icon thumbnail.
- Create-plan screen has no cover-photo picker, and creating a plan works end-to-end.

- [ ] **Step 4: Final commit (if any smoke fixes were needed)**

```bash
git add -A
git commit -m "test: verify PlanBanner across all render sites"
```

---

## Self-Review Notes

- **Spec coverage:** component (Task 1), all five render sites (Tasks 2-5 + hero/inline in 4), cover-upload removal (Task 6), storage rule (Task 7), testing (Tasks 1 & 8) — all covered.
- **Type consistency:** `PlanBanner` props (`category?`, `seed`, `variant`, `style`) and the exported `hashSeed` are used identically in every call site and test.
- **No duplication:** banner renders no text; every site keeps its existing title/category, verified by the "decorative only" test and the inline-cover deletion in Task 4.
