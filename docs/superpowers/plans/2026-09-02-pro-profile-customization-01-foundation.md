# Pro Profile Customization — Plan 1: Foundation (shared Avatar)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a single shared `<Avatar>` component and a `lib/profileCustomization.ts` helper module, and migrate every avatar-image render site onto them — a behavior-identical refactor that lays the groundwork for animated pfps, decorations, and preview.

**Architecture:** A pure helper (`resolveAvatarSource`, `initialsFor`) decides which image URI (or initials fallback) an avatar shows given the precedence gif→still→upload→initials. `<Avatar>` renders that decision via `expo-image` (which natively plays/freezes animated formats) and reserves a decoration-overlay slot that stays inert until Plan 3 populates the registry. The four real avatar-image sites are swapped to `<Avatar>` reusing their existing styles, so the UI looks unchanged.

**Tech Stack:** React Native + Expo (SDK 55), TypeScript, `expo-image` (already installed `~55.0.11`), Jest (`jest-expo`) + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-09-01-pro-profile-customization-design.md`

## Feature roadmap (this is plan 1 of 5)

1. **Foundation (this plan)** — shared `<Avatar>` + `lib/profileCustomization.ts`, migrate avatar sites. No user-visible change.
2. **Tenor pfp + banner** — `lib/tenor.ts`, `GifPicker`, profile banner header, Pro-gated apply.
3. **Decorations** — 3 overlay assets + registry + compositing + picker.
4. **Text & colors** — bio Pro-extension, tagline, curated accent/gradient + name color.
5. **Preview editor + Pro-gate rule** — unify into the try-before-buy editor.

## Scope notes (verified against the codebase)

- The only avatar-**image** render sites are **four**: `app/(tabs)/profile.tsx` and `app/user-profile.tsx` (profile screens → `animated`), `app/(tabs)/index.tsx` and `app/(tabs)/activity.tsx` (lists → static still).
- `app/social.tsx` renders **initials only** (no avatar image) with an online-dot wrapper — **out of scope**, leave as-is.
- `app/chat.tsx`, `app/plan-detail.tsx`, `components/MomentsGallery.tsx` render **non-avatar** images (chat/plan/moment photos) — out of scope.
- On `main`, components import `Colors` directly from `lib/theme` (the themed `useThemedStyles` variant lives only on the unmerged `feature/themes` branch). Follow the direct-import pattern here.

## File Structure

- **Create** `lib/profileCustomization.ts` — customization types, `resolveAvatarSource`, `initialsFor`, and an (initially empty) `DECORATIONS` registry. One responsibility: profile-customization data helpers.
- **Create** `components/Avatar.tsx` — the shared avatar renderer. One responsibility: turn avatar props into pixels.
- **Create** `__tests__/profileCustomization.test.ts` — pure-function tests.
- **Create** `__tests__/ui/Avatar.test.tsx` — render tests.
- **Modify** `app/(tabs)/profile.tsx` (~475–481), `app/user-profile.tsx` (~308–316), `app/(tabs)/index.tsx` (~480–483), `app/(tabs)/activity.tsx` (~197–200) — swap inline avatar to `<Avatar>`.

---

### Task 1: `lib/profileCustomization.ts` — customization helpers

**Files:**
- Create: `lib/profileCustomization.ts`
- Test: `__tests__/profileCustomization.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/profileCustomization.test.ts
import { resolveAvatarSource, initialsFor } from '../lib/profileCustomization';

describe('resolveAvatarSource', () => {
  it('prefers the animated gif on profile screens', () => {
    expect(
      resolveAvatarSource({ animated: true, gifUrl: 'g', stillUrl: 's', uploadUrl: 'u' })
    ).toEqual({ kind: 'image', uri: 'g', animated: true });
  });

  it('uses the still frame when not animated even if a gif exists', () => {
    expect(
      resolveAvatarSource({ animated: false, gifUrl: 'g', stillUrl: 's', uploadUrl: 'u' })
    ).toEqual({ kind: 'image', uri: 's', animated: false });
  });

  it('falls back to the uploaded avatar when there is no gif/still', () => {
    expect(resolveAvatarSource({ uploadUrl: 'u' })).toEqual({
      kind: 'image',
      uri: 'u',
      animated: false,
    });
  });

  it('falls back to the uploaded avatar on a profile screen when no gif is set', () => {
    expect(resolveAvatarSource({ animated: true, uploadUrl: 'u' })).toEqual({
      kind: 'image',
      uri: 'u',
      animated: false,
    });
  });

  it('returns initials when there is no image at all', () => {
    expect(resolveAvatarSource({})).toEqual({ kind: 'initials' });
  });
});

describe('initialsFor', () => {
  it('uppercases the first character', () => {
    expect(initialsFor('bruce')).toBe('B');
  });
  it('trims leading whitespace', () => {
    expect(initialsFor('  amina')).toBe('A');
  });
  it('defaults to U when name is empty/undefined', () => {
    expect(initialsFor('')).toBe('U');
    expect(initialsFor(undefined)).toBe('U');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/profileCustomization.test.ts`
Expected: FAIL — `Cannot find module '../lib/profileCustomization'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/profileCustomization.ts

/** IDs of the curated avatar decorations. Assets are wired up in Plan 3. */
export type DecorationId = 'cat-ears' | 'glitch' | 'sparkle';

/**
 * Registry of decoration overlays: id -> { asset (require()'d image), animated }.
 * Intentionally EMPTY in Plan 1 — populated in Plan 3 once the art exists.
 * `<Avatar>` treats a missing id as "no decoration".
 */
export const DECORATIONS: Partial<Record<DecorationId, { asset: number; animated: boolean }>> = {};

/** All optional profile-customization fields stored on the Firestore user doc. */
export type ProfileCustomization = {
  avatarUrl?: string;        // existing static upload (free tier)
  avatarGifUrl?: string;     // Tenor animated pfp (Pro) — Plan 2
  avatarStillUrl?: string;   // Tenor preview still for lists — Plan 2
  bannerGifUrl?: string;     // Plan 2
  bannerStillUrl?: string;   // Plan 2
  decorationId?: DecorationId | null; // Plan 3
  bio?: string;              // free text; Pro unlocks length/color — Plan 4
  tagline?: string;          // Pro — Plan 4
  profileAccent?: string;    // Pro palette key — Plan 4
  nameColor?: string;        // Pro palette key — Plan 4
};

export type AvatarSource =
  | { kind: 'image'; uri: string; animated: boolean }
  | { kind: 'initials' };

/**
 * Decide which source an avatar renders.
 * Precedence: animated gif (profile screens only) -> still frame -> uploaded avatar -> initials.
 */
export function resolveAvatarSource(opts: {
  animated?: boolean;
  gifUrl?: string;
  stillUrl?: string;
  uploadUrl?: string;
}): AvatarSource {
  const { animated, gifUrl, stillUrl, uploadUrl } = opts;
  if (animated && gifUrl) return { kind: 'image', uri: gifUrl, animated: true };
  if (stillUrl) return { kind: 'image', uri: stillUrl, animated: false };
  if (uploadUrl) return { kind: 'image', uri: uploadUrl, animated: false };
  return { kind: 'initials' };
}

/** First letter of a name, uppercased; 'U' when absent. */
export function initialsFor(name?: string): string {
  const c = name?.trim()?.[0];
  return (c || 'U').toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/profileCustomization.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/profileCustomization.ts __tests__/profileCustomization.test.ts
git commit -m "feat(profile): add profileCustomization helpers (avatar source resolution)"
```

---

### Task 2: `components/Avatar.tsx` — shared avatar renderer

**Files:**
- Create: `components/Avatar.tsx`
- Test: `__tests__/ui/Avatar.test.tsx`

**Design:** `<Avatar>` is a drop-in for the existing inline `{url ? <Image/> : <fallback/>}` blocks. It reuses each call site's own styles (`imageStyle`, `fallbackStyle`, `initialStyle`) so the migration is visually identical. It renders via `expo-image`, whose `autoplay` prop plays animated formats when `true` and freezes to the first frame when `false`. The decoration `<Image>` only renders when the registry has the id (never in Plan 1).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/ui/Avatar.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Avatar from '../../components/Avatar';

describe('Avatar', () => {
  it('renders initials when there is no image', () => {
    render(<Avatar name="amina" testID="av" />);
    expect(screen.getByText('A')).toBeOnTheScreen();
    expect(screen.queryByTestId('av-image')).toBeNull();
  });

  it('renders an image when an uploaded url is provided', () => {
    render(<Avatar name="amina" uploadUrl="https://x/a.jpg" testID="av" />);
    expect(screen.getByTestId('av-image')).toBeOnTheScreen();
    expect(screen.queryByText('A')).toBeNull();
  });

  it('plays the gif on a profile screen (animated) and uses the still elsewhere', () => {
    const { rerender } = render(
      <Avatar name="amina" gifUrl="https://x/a.gif" stillUrl="https://x/a.jpg" animated testID="av" />
    );
    expect(screen.getByTestId('av-image').props.source).toEqual({ uri: 'https://x/a.gif' });
    expect(screen.getByTestId('av-image').props.autoplay).toBe(true);

    rerender(
      <Avatar name="amina" gifUrl="https://x/a.gif" stillUrl="https://x/a.jpg" testID="av" />
    );
    expect(screen.getByTestId('av-image').props.source).toEqual({ uri: 'https://x/a.jpg' });
    expect(screen.getByTestId('av-image').props.autoplay).toBe(false);
  });

  it('renders no decoration in Plan 1 (empty registry)', () => {
    render(<Avatar name="amina" decorationId="cat-ears" testID="av" />);
    expect(screen.queryByTestId('avatar-decoration')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/ui/Avatar.test.tsx`
Expected: FAIL — `Cannot find module '../../components/Avatar'`.

- [ ] **Step 3: Write the implementation**

```tsx
// components/Avatar.tsx
import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Image, ImageStyle } from 'expo-image';
import {
  resolveAvatarSource,
  initialsFor,
  DECORATIONS,
  DecorationId,
} from '../lib/profileCustomization';

type AvatarProps = {
  name?: string;
  uploadUrl?: string;
  gifUrl?: string;
  stillUrl?: string;
  decorationId?: DecorationId | null;
  /** True only on the full profile screens, where animated pfps play. */
  animated?: boolean;
  imageStyle?: StyleProp<ImageStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  initialStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export default function Avatar({
  name,
  uploadUrl,
  gifUrl,
  stillUrl,
  decorationId,
  animated = false,
  imageStyle,
  fallbackStyle,
  initialStyle,
  testID,
}: AvatarProps) {
  const src = resolveAvatarSource({ animated, gifUrl, stillUrl, uploadUrl });
  const decoration = decorationId ? DECORATIONS[decorationId] : undefined;
  const imageTestID = testID ? `${testID}-image` : 'avatar-image';

  return (
    <>
      {src.kind === 'image' ? (
        <Image
          testID={imageTestID}
          source={{ uri: src.uri }}
          style={imageStyle}
          contentFit="cover"
          autoplay={src.animated}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={fallbackStyle}>
          <Text style={initialStyle}>{initialsFor(name)}</Text>
        </View>
      )}
      {decoration ? (
        <Image
          testID="avatar-decoration"
          source={decoration.asset}
          style={StyleSheet.absoluteFill as StyleProp<ImageStyle>}
          contentFit="contain"
          autoplay={animated}
          pointerEvents="none"
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/ui/Avatar.test.tsx`
Expected: PASS (4 tests). Note: `expo-image` under `jest-expo` renders a host view that forwards `source`/`autoplay` props, so the prop assertions hold.

- [ ] **Step 5: Commit**

```bash
git add components/Avatar.tsx __tests__/ui/Avatar.test.tsx
git commit -m "feat(profile): add shared Avatar component (expo-image, decoration slot)"
```

---

### Task 3: Migrate `app/(tabs)/profile.tsx` (own profile → animated)

**Files:**
- Modify: `app/(tabs)/profile.tsx` (import + ~475–481)

- [ ] **Step 1: Add the import**

Add alongside the other component imports (near line 26, after `import PlanBanner ...`):

```tsx
import Avatar from '../../components/Avatar';
```

- [ ] **Step 2: Replace the inline avatar block**

Replace (currently ~lines 475–481):

```tsx
              {profile?.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{initials}</Text>
                </View>
              )}
```

with:

```tsx
              <Avatar
                testID="profile-avatar"
                name={profile?.displayName || auth.currentUser?.email || undefined}
                uploadUrl={profile?.avatarUrl}
                animated
                imageStyle={styles.avatarImage}
                fallbackStyle={styles.avatarFallback}
                initialStyle={styles.avatarInitial}
              />
```

(Leave the surrounding `<Animated.View style={styles.avatarCircle}>` wrapper and the `uploadingAvatar` overlay exactly as they are — `<Avatar>` replaces only the `{profile?.avatarUrl ? ... : ...}` conditional.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. If `Image`/`Text`/`View` from `react-native` become unused imports elsewhere in the file, leave them — they are still used by the upload overlay and the rest of the screen.

- [ ] **Step 4: Verify in the app**

Run: `npx expo start` (Expo Go). Open the Profile tab. Confirm the avatar (uploaded photo or initials) looks identical to before and the tap-to-change-photo still works.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/profile.tsx"
git commit -m "refactor(profile): render own-profile avatar via shared Avatar"
```

---

### Task 4: Migrate `app/user-profile.tsx` (other user's profile → animated)

**Files:**
- Modify: `app/user-profile.tsx` (import + ~308–316)

- [ ] **Step 1: Add the import**

Add with the other component imports near the top of the file:

```tsx
import Avatar from '../components/Avatar';
```

- [ ] **Step 2: Replace the inline avatar block**

Replace (currently ~lines 308–316):

```tsx
            {profile.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl }}
                style={styles.avatarImage}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
```

with:

```tsx
            <Avatar
              testID="user-avatar"
              name={profile.displayName}
              uploadUrl={profile.avatarUrl}
              animated
              imageStyle={styles.avatarImage}
              initialStyle={styles.avatarText}
            />
```

(No `fallbackStyle` is passed because this site had no fallback wrapper View; `<Avatar>` wraps the initials in an unstyled `View`, which the surrounding `avatarCircle` still centers. Verify in Step 4.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify in the app**

In Expo Go, open another user's profile (via a friend/host link). Confirm their avatar image / initials render centered and unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/user-profile.tsx
git commit -m "refactor(profile): render user-profile avatar via shared Avatar"
```

---

### Task 5: Migrate `app/(tabs)/index.tsx` (home header → static)

**Files:**
- Modify: `app/(tabs)/index.tsx` (import + ~480–483)

- [ ] **Step 1: Add the import**

Add with the other component imports near the top:

```tsx
import Avatar from '../../components/Avatar';
```

- [ ] **Step 2: Replace the inline avatar block**

Replace (currently ~lines 480–483, inside the header avatar `TouchableOpacity`):

```tsx
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
```

...through the end of that fallback `View` (the block that renders `styles.avatarFallback` with the initial inside). Replace the whole `{photoURL ? (...) : (...)}` conditional with:

```tsx
            <Avatar
              testID="home-avatar"
              name={displayName}
              uploadUrl={photoURL || undefined}
              imageStyle={styles.avatarImage}
              fallbackStyle={styles.avatarFallback}
              initialStyle={styles.avatarInitial}
            />
```

Note: this is a **static** surface — no `animated` prop (defaults to `false`), so it always shows the still/upload/initials, never plays a gif. If this site's initial-text style is named differently than `avatarInitial` (open the file to confirm the style key used inside `avatarFallback`), pass that key as `initialStyle`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify in the app**

In Expo Go, open the Home tab. Confirm the header avatar looks identical (image or initials) and still navigates to Profile on tap.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "refactor(home): render header avatar via shared Avatar"
```

---

### Task 6: Migrate `app/(tabs)/activity.tsx` (friend-request row → static)

**Files:**
- Modify: `app/(tabs)/activity.tsx` (import + ~197–200)

- [ ] **Step 1: Add the import**

Add with the other component imports near the top:

```tsx
import Avatar from '../../components/Avatar';
```

- [ ] **Step 2: Replace the inline avatar block**

Replace (currently ~lines 197–200, inside the request row):

```tsx
        {req.fromAvatar ? (
          <Image source={{ uri: req.fromAvatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
```

...through the end of that fallback `View`. Replace the whole `{req.fromAvatar ? (...) : (...)}` conditional with:

```tsx
        <Avatar
          testID="request-avatar"
          name={req.fromName}
          uploadUrl={req.fromAvatar || undefined}
          imageStyle={styles.avatar}
          fallbackStyle={styles.avatarFallback}
          initialStyle={styles.avatarInitial}
        />
```

Note: open the file to confirm (a) the display-name field on the request object (used for initials — it may be `req.fromName` or similar) and (b) the initial-text style key inside `styles.avatarFallback`; pass the real names. Static surface — no `animated` prop.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify in the app**

In Expo Go, open the Activity tab with a pending friend request. Confirm the requester avatar/initials render unchanged.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/activity.tsx"
git commit -m "refactor(activity): render request-row avatar via shared Avatar"
```

---

### Task 7: Full regression check

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npx jest`
Expected: all suites pass, including the two new ones (previous count 70 + 12 new = 82; confirm no regressions).

- [ ] **Step 2: Typecheck the project**

Run: `npx tsc --noEmit`
Expected: clean (no new errors vs. baseline).

- [ ] **Step 3: Smoke-test the four surfaces in the app**

In Expo Go, visit Home, Activity, own Profile, and another user's profile. Confirm every avatar renders exactly as before this plan.

- [ ] **Step 4: Commit any final touch-ups** (only if Steps 1–3 required fixes)

```bash
git add -A
git commit -m "test(profile): foundation avatar migration regression pass"
```

---

## Self-Review

- **Spec coverage (Foundation slice):** shared `<Avatar>` ✅ (Task 2); `lib/profileCustomization.ts` with source precedence gif→still→upload→initials ✅ (Task 1); decoration slot present but inert ✅ (Task 2, empty `DECORATIONS`); all avatar sites migrated ✅ (Tasks 3–6, scoped to the 4 real sites). Tenor, banner header, decorations art, bio/tagline/colors, preview editor, and the Firestore Pro-gate rule are **later plans** by design — not gaps.
- **Placeholder scan:** none — every code step shows full code; the two "open the file to confirm the style/field name" notes (Tasks 5–6) are because those files weren't fully read here, and each still ships concrete replacement code with the expected names.
- **Type consistency:** `resolveAvatarSource`/`initialsFor`/`AvatarSource`/`DecorationId`/`DECORATIONS`/`ProfileCustomization` are defined in Task 1 and consumed unchanged in Task 2; `<Avatar>` prop names (`uploadUrl`, `gifUrl`, `stillUrl`, `decorationId`, `animated`, `imageStyle`, `fallbackStyle`, `initialStyle`, `testID`) are identical across Tasks 2–6.
