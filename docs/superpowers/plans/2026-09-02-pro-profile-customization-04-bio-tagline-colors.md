# Pro Profile Customization — Plan 4: bio, tagline & curated colors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give Pro users a longer/accent-colored bio, a custom tagline line, a curated display-name color, and a curated profile accent (rendered as a subtle gradient band behind the identity area). Free users keep a plain bio (shorter cap) and see an upsell.

**Architecture:** A curated color palette + validators live in `lib/profileCustomization.ts` (extends the Plan-1 module). A small reusable `<ColorSwatchRow>` drives selection. The profile edit modal gains a tagline field + two swatch rows + a Pro-aware bio length; the profile display applies the chosen colors on both `profile.tsx` and `user-profile.tsx`. **Scope simplification (approved):** the "profile card gradient" is a curated **accent → transparent** vertical gradient (one curated accent drives it), not a 2-color gradient-pair editor — still a gradient, still curated, far less UI.

**Tech Stack:** React Native + Expo SDK 55, TypeScript, `expo-linear-gradient` (already used by `components/PlanBanner.tsx`), Jest (`jest-expo`) + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-09-01-pro-profile-customization-design.md`
**Builds on:** Plan 1 (`lib/profileCustomization.ts`) on branch `feature/pro-profile-customization`.

## Key facts (verified)

- **`profile.tsx` (own profile, editable):** edit state incl. `bio`/`displayName` (`useState`, ~166–168), populated from the user doc (~199–200). Save builds an `updates: Partial<UserProfile>` object (~288–294: `displayName, bio, city, country, emergencyContact`), `updateDoc(users/{uid}, updates)`, then mirrors into `setProfile` (~301–313). Edit modal (`<Modal visible={editing}>`, ~733+) has label+`TextInput` rows; the bio input is at ~782 with `maxLength={200}`. Display: `heroName` (~574), `heroHandle` (~578), `heroBio` (~580–583) inside `styles.heroInfo`, within `styles.heroRow`.
- **Pro flag** available via `useSubscription()` → `isPro` (added to this file in Plan 2). Paywall via `showPaywall` state + `<PaywallModal>` (added in Plan 2).
- **Theme tokens** that exist: `Colors.text` (NOT `textPrimary`), `Colors.textSecondary/textMuted/background/surface`, `Spacing.xs/sm/md/xl`, `Radius.sm/md/lg`, `FontSize.*`, `FontWeight.*`. No `Radius.pill`.
- **`user-profile.tsx`:** `Profile` type ~40+ (extended in Plan 2 with the gif/banner fields); renders `styles.displayName` (~318) and a bio somewhere below — READ before editing.

## File Structure

- **Modify** `lib/profileCustomization.ts` — add `PROFILE_COLORS`, `resolveColor`, `bioMaxFor`, `BIO_MAX`, `TAGLINE_MAX`, `accentGradient`.
- **Create** `components/ColorSwatchRow.tsx` — curated swatch selector. One responsibility: pick a color key (or none).
- **Create** tests `__tests__/ui/ColorSwatchRow.test.tsx`; extend `__tests__/profileCustomization.test.ts`.
- **Modify** `app/(tabs)/profile.tsx` — edit controls + display.
- **Modify** `app/user-profile.tsx` — display (read-only).

---

### Task 1: Extend `lib/profileCustomization.ts` — palette + validators

**Files:** Modify `lib/profileCustomization.ts`; Modify `__tests__/profileCustomization.test.ts`.

- [ ] **Step 1: Add failing tests** (append to `__tests__/profileCustomization.test.ts`):

```ts
import {
  PROFILE_COLORS,
  resolveColor,
  bioMaxFor,
  BIO_MAX,
  TAGLINE_MAX,
  accentGradient,
} from '../lib/profileCustomization';

describe('profile color palette', () => {
  it('has a non-empty curated palette of {key,label,value}', () => {
    expect(PROFILE_COLORS.length).toBeGreaterThanOrEqual(6);
    for (const c of PROFILE_COLORS) {
      expect(c.key).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(c.value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
  it('has unique keys', () => {
    const keys = PROFILE_COLORS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('resolveColor returns the hex for a known key and undefined otherwise', () => {
    expect(resolveColor(PROFILE_COLORS[0].key)).toBe(PROFILE_COLORS[0].value);
    expect(resolveColor('nope')).toBeUndefined();
    expect(resolveColor(undefined)).toBeUndefined();
  });
});

describe('bio + tagline limits', () => {
  it('bioMaxFor gives the free cap to free users and the pro cap to pro', () => {
    expect(bioMaxFor(false)).toBe(BIO_MAX.free);
    expect(bioMaxFor(true)).toBe(BIO_MAX.pro);
    expect(BIO_MAX.pro).toBeGreaterThan(BIO_MAX.free);
  });
  it('TAGLINE_MAX is a small positive number', () => {
    expect(TAGLINE_MAX).toBeGreaterThan(0);
    expect(TAGLINE_MAX).toBeLessThanOrEqual(80);
  });
});

describe('accentGradient', () => {
  it('returns an accent->transparent pair from a hex', () => {
    const [a, b] = accentGradient('#1E9E52');
    expect(a.toLowerCase()).toBe('#1e9e522e');
    expect(b.toLowerCase()).toBe('#1e9e5200');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx jest __tests__/profileCustomization.test.ts`.

- [ ] **Step 3: Implement** (append to `lib/profileCustomization.ts`):

```ts
/** Curated profile colors. Chosen mid-saturation so display-name text stays
 *  legible on both light and (future) dark profile surfaces — the readability
 *  floor. Users pick from these keys; we never store arbitrary hex. */
export type ProfileColor = { key: string; label: string; value: string };

export const PROFILE_COLORS: ProfileColor[] = [
  { key: 'crimson', label: 'Crimson', value: '#D64545' },
  { key: 'amber', label: 'Amber', value: '#B8860B' },
  { key: 'emerald', label: 'Emerald', value: '#1E9E52' },
  { key: 'teal', label: 'Teal', value: '#0E9AA7' },
  { key: 'azure', label: 'Azure', value: '#2E6FD6' },
  { key: 'indigo', label: 'Indigo', value: '#5B54D6' },
  { key: 'violet', label: 'Violet', value: '#8B46C7' },
  { key: 'rose', label: 'Rose', value: '#C6417F' },
  { key: 'slate', label: 'Slate', value: '#5A6472' },
];

/** Hex for a palette key, or undefined if unset/unknown. */
export function resolveColor(key?: string): string | undefined {
  return PROFILE_COLORS.find((c) => c.key === key)?.value;
}

export const BIO_MAX = { free: 150, pro: 300 } as const;
export function bioMaxFor(isPro: boolean): number {
  return isPro ? BIO_MAX.pro : BIO_MAX.free;
}

export const TAGLINE_MAX = 60;

/** A subtle accent->transparent vertical gradient pair (8-digit hex alpha). */
export function accentGradient(hex: string): [string, string] {
  return [`${hex}2E`, `${hex}00`]; // ~18% -> 0%
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/profileCustomization.ts __tests__/profileCustomization.test.ts
git commit -m "feat(profile): curated color palette + bio/tagline validators"
```

---

### Task 2: `components/ColorSwatchRow.tsx` — swatch selector

**Files:** Create `components/ColorSwatchRow.tsx`; Test `__tests__/ui/ColorSwatchRow.test.tsx`.

**Design:** A horizontal row of tappable circular swatches from a `ProfileColor[]`, plus a leading "None" option that clears the selection. Calls `onSelect(key | undefined)`. Marks the selected swatch (a ring). Purely presentational.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/ui/ColorSwatchRow.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ColorSwatchRow from '../../components/ColorSwatchRow';
import { PROFILE_COLORS } from '../../lib/profileCustomization';

describe('ColorSwatchRow', () => {
  it('renders a swatch per palette color plus a none option', () => {
    render(<ColorSwatchRow selectedKey={undefined} onSelect={jest.fn()} />);
    expect(screen.getByTestId('swatch-none')).toBeOnTheScreen();
    expect(screen.getByTestId(`swatch-${PROFILE_COLORS[0].key}`)).toBeOnTheScreen();
  });

  it('calls onSelect with the color key when a swatch is pressed', () => {
    const onSelect = jest.fn();
    render(<ColorSwatchRow selectedKey={undefined} onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId(`swatch-${PROFILE_COLORS[1].key}`));
    expect(onSelect).toHaveBeenCalledWith(PROFILE_COLORS[1].key);
  });

  it('calls onSelect with undefined when none is pressed', () => {
    const onSelect = jest.fn();
    render(<ColorSwatchRow selectedKey={PROFILE_COLORS[0].key} onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('swatch-none'));
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```tsx
// components/ColorSwatchRow.tsx
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../lib/theme';
import { PROFILE_COLORS } from '../lib/profileCustomization';

type Props = {
  selectedKey?: string;
  onSelect: (key: string | undefined) => void;
};

const SIZE = 34;

export default function ColorSwatchRow({ selectedKey, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <TouchableOpacity
        testID="swatch-none"
        onPress={() => onSelect(undefined)}
        style={[styles.swatch, styles.none, !selectedKey && styles.selected]}
        accessibilityLabel="No color"
      >
        <Ionicons name="ban-outline" size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {PROFILE_COLORS.map((c) => (
        <TouchableOpacity
          key={c.key}
          testID={`swatch-${c.key}`}
          onPress={() => onSelect(c.key)}
          style={[
            styles.swatch,
            { backgroundColor: c.value },
            selectedKey === c.key && styles.selected,
          ]}
          accessibilityLabel={c.label}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  swatch: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  none: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.textMuted },
  selected: { borderWidth: 3, borderColor: Colors.text },
});
```

- [ ] **Step 4: Run, expect PASS (3 tests)**, then `npx tsc --noEmit`. If any theme token is missing, substitute the closest existing one and note it.

- [ ] **Step 5: Commit**

```bash
git add components/ColorSwatchRow.tsx __tests__/ui/ColorSwatchRow.test.tsx
git commit -m "feat(profile): add ColorSwatchRow selector"
```

---

### Task 3: Edit controls in `app/(tabs)/profile.tsx`

**Files:** Modify `app/(tabs)/profile.tsx`. READ the edit-state block (~166–205), the save handler (~284–320), and the edit modal (~733–840) first.

- [ ] **Step 1: Imports**

```tsx
import ColorSwatchRow from '../../components/ColorSwatchRow';
import { bioMaxFor, TAGLINE_MAX } from '../../lib/profileCustomization';
```

- [ ] **Step 2: Extend `UserProfile` type** (add):

```tsx
  tagline?: string;
  profileAccent?: string;
  nameColor?: string;
```

- [ ] **Step 3: Add edit state** (next to `bio`/`displayName` useState ~167):

```tsx
  const [tagline, setTagline] = useState('');
  const [profileAccent, setProfileAccent] = useState<string | undefined>(undefined);
  const [nameColor, setNameColor] = useState<string | undefined>(undefined);
```

- [ ] **Step 4: Populate from the doc** (next to `setBio(data.bio || '')` ~199):

```tsx
      setTagline(data.tagline || '');
      setProfileAccent(data.profileAccent || undefined);
      setNameColor(data.nameColor || undefined);
```

- [ ] **Step 5: Persist in save.** In the `updates` object (~288), add the three fields ONLY when Pro (free users can't set them). Replace the object literal build with:

```tsx
    const updates: Partial<UserProfile> = {
      displayName: trimmedName,
      bio,
      city: trimmedCity,
      country: trimmedCountry,
      emergencyContact: { name: emergencyName.trim(), phone: emergencyPhone.trim() },
    };
    if (isPro) {
      updates.tagline = tagline.trim();
      updates.profileAccent = profileAccent ?? '';
      updates.nameColor = nameColor ?? '';
    }
```

And mirror the same Pro-gated fields into the `setProfile((p) => …)` object (~304): add, inside the spread object, `...(isPro ? { tagline: tagline.trim(), profileAccent: profileAccent ?? '', nameColor: nameColor ?? '' } : {}),`. Add `isPro, tagline, profileAccent, nameColor` to the save callback's dependency array.

(Storing `''` when a Pro user clears a color is intentional — `resolveColor('')` returns undefined, so display falls back to the default.)

- [ ] **Step 6: Bio length becomes Pro-aware.** On the bio `<TextInput>` (~782) change `maxLength={200}` to `maxLength={bioMaxFor(isPro)}`.

- [ ] **Step 7: Add the new edit controls** inside the edit modal, after the bio input's row (follow the existing label+field pattern; use the file's existing label style). Insert:

```tsx
              {isPro ? (
                <>
                  <Text style={styles.inputLabel}>Tagline</Text>
                  <TextInput
                    testID="edit-tagline"
                    value={tagline}
                    onChangeText={setTagline}
                    placeholder="A short line under your name"
                    placeholderTextColor={Colors.textMuted}
                    maxLength={TAGLINE_MAX}
                    style={styles.input}
                  />

                  <Text style={styles.inputLabel}>Name color</Text>
                  <ColorSwatchRow selectedKey={nameColor} onSelect={setNameColor} />

                  <Text style={styles.inputLabel}>Profile accent</Text>
                  <ColorSwatchRow selectedKey={profileAccent} onSelect={setProfileAccent} />
                </>
              ) : (
                <TouchableOpacity
                  testID="edit-customize-upsell"
                  onPress={() => {
                    closeEdit();
                    setShowPaywall(true);
                  }}
                  style={styles.upsellRow}
                >
                  <Ionicons name="color-palette-outline" size={16} color={Colors.text} />
                  <Text style={styles.upsellText}>Upgrade to Pro to add a tagline & colors</Text>
                </TouchableOpacity>
              )}
```

Use the real label/input style names this file already uses (open the modal to confirm — they may be `inputLabel`/`input` or similar; substitute the actual names). Add `upsellRow`/`upsellText` styles to the StyleSheet:

```tsx
  upsellRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  upsellText: { color: Colors.text, fontSize: FontSize.sm },
```

- [ ] **Step 8: Verify** — `npx tsc --noEmit` clean; `npx jest` full suite green.

- [ ] **Step 9: Commit**

```bash
git add "app/(tabs)/profile.tsx"
git commit -m "feat(profile): edit tagline + name/accent colors (Pro), Pro-aware bio length"
```

---

### Task 4: Display the colors on `app/(tabs)/profile.tsx`

**Files:** Modify `app/(tabs)/profile.tsx` (display region ~572–585, `heroRow`).

- [ ] **Step 1: Imports**

```tsx
import { LinearGradient } from 'expo-linear-gradient';
import { resolveColor, accentGradient } from '../../lib/profileCustomization';
```

- [ ] **Step 2: Derive display colors** (near other `useMemo`s / render top of component):

```tsx
  const accentValue = resolveColor(profile?.profileAccent);
  const nameColorValue = resolveColor(profile?.nameColor);
```

- [ ] **Step 3: Apply name color + tagline + bio accent.** In `styles.heroInfo`:
  - Name: `<Text style={[styles.heroName, nameColorValue ? { color: nameColorValue } : null]} numberOfLines={1}>`.
  - After the handle `<Text>` and before the bio, add the tagline:
```tsx
              {profile?.tagline ? (
                <Text style={[styles.heroTagline, accentValue ? { color: accentValue } : null]} numberOfLines={1}>
                  {profile.tagline}
                </Text>
              ) : null}
```
  - Bio: `<Text style={[styles.heroBio, accentValue ? { color: accentValue } : null]} numberOfLines={2}>`.

Add a `heroTagline` style (mirror `heroHandle` but italic or medium weight):
```tsx
  heroTagline: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
```

- [ ] **Step 4: Accent gradient band behind the identity row.** As the FIRST child of `styles.heroRow` (so it sits behind the avatar + info), add:

```tsx
            {accentValue ? (
              <LinearGradient
                colors={accentGradient(accentValue)}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            ) : null}
```
Ensure `styles.heroRow` has `overflow: 'hidden'` and (if not already) `position: 'relative'` so the gradient clips to the row. Add those two properties to `heroRow` if missing.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npx jest` green.

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/profile.tsx"
git commit -m "feat(profile): render name color, tagline, bio accent + accent gradient on own profile"
```

---

### Task 5: Display the colors on `app/user-profile.tsx` (read-only)

**Files:** Modify `app/user-profile.tsx`. READ the `Profile` type and the display of `displayName` + bio first.

- [ ] **Step 1: Imports**

```tsx
import { LinearGradient } from 'expo-linear-gradient';
import { resolveColor, accentGradient } from '../lib/profileCustomization';
```

- [ ] **Step 2: Extend `Profile` type** (add `tagline?`, `profileAccent?`, `nameColor?`).

- [ ] **Step 3: Derive** `const accentValue = resolveColor(profile?.profileAccent);` and `const nameColorValue = resolveColor(profile?.nameColor);` (guard for `profile` possibly loading).

- [ ] **Step 4: Apply**:
  - Display name `<Text>` → add `nameColorValue ? { color: nameColorValue } : null` to its style array.
  - Render the tagline under the name if `profile.tagline` (style analogous to the name's subtitle; color with `accentValue`).
  - If this screen shows a bio, tint it with `accentValue`.
  - Optionally add the same accent `<LinearGradient absoluteFill>` behind the identity header block (only if it composes cleanly with the Plan-2 banner; if unsure, skip the gradient here and note it — name/tagline/bio color are the priority). Describe what you did.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npx jest` green.

- [ ] **Step 6: Commit**

```bash
git add app/user-profile.tsx
git commit -m "feat(profile): render other users' name color, tagline & bio accent"
```

---

### Task 6: Regression + manual-verify note

- [ ] **Step 1:** `npx jest` → all green (expect prior 95 + 6 palette + 3 ColorSwatchRow = 104).
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Record manual on-device checks: (a) Pro edit modal shows tagline + two swatch rows; picking a name color recolors the display name, an accent recolors the tagline/bio and shows a faint gradient behind the identity area; (b) clearing a swatch ("none") reverts to default; (c) free edit modal shows only the upsell row (bio capped at 150) and tapping it opens the paywall; (d) name stays legible on every curated color (readability floor).
- [ ] **Step 4:** Commit any fixes.

---

## Self-Review

- **Spec coverage:** bio free≤150 / Pro≤300 + accent color ✅ (Tasks 1,3,4); tagline (Pro) ✅ (Tasks 3,4,5); curated profile accent/gradient (Pro) ✅ (Tasks 1,2,4 — accent→transparent gradient, simplification noted); display-name color (Pro) with curated readability floor ✅ (Tasks 1,2,4); free users see an upsell, not the controls ✅ (Task 3). Fields optional, no migration ✅.
- **Placeholder scan:** none; "confirm the real label/input style names" (Task 3) and "skip the gradient here if it doesn't compose" (Task 5) are integration guardrails, each shipping concrete code.
- **Type consistency:** `PROFILE_COLORS/ProfileColor/resolveColor/bioMaxFor/BIO_MAX/TAGLINE_MAX/accentGradient` defined in Task 1, consumed unchanged in Tasks 2–5; `<ColorSwatchRow>` props `{selectedKey, onSelect}` consistent Tasks 2/3; user-doc fields `tagline/profileAccent/nameColor` identical across Tasks 3/5 and match Plan 1's `ProfileCustomization`.
