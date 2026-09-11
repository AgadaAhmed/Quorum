# Pro Profile Customization — Plan 5: try-before-buy Customize screen + server-side Pro-gate rule

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (1) Enforce the Pro-only customization fields server-side in `firestore.rules` so a tampered client can't set flair without paying; (2) add a dedicated **Customize** screen that lets ANY user (free or Pro) live-preview avatar GIF / banner / name color / accent / tagline on a profile card, with a single **Apply** that persists for Pro and opens the paywall for free — true try-before-buy.

**Architecture:** The rule extends the existing owner-update branch: the Pro customization keys may only change when the doc's `subscriptionTier == 'pro'` (bio/displayName/etc. stay free-writable). A presentational `<ProfilePreviewCard>` renders a customization "draft"; the new `app/customize-profile.tsx` screen holds that draft in local state, wires the existing `<GifPicker>` + `<ColorSwatchRow>` controls to it (open to everyone), previews live, and gates only the Apply. The existing inline Plan-2 avatar/banner flows stay as a Pro convenience (minor redundancy, noted).

**Tech Stack:** React Native + Expo SDK 55, TypeScript, expo-router, Firestore + `@firebase/rules-unit-testing` (via `npm run test:rules`, which needs the Firestore emulator + Java), Jest (`jest-expo`) + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-09-01-pro-profile-customization-design.md`
**Builds on:** Plans 1/2/4 on branch `feature/pro-profile-customization` — `components/Avatar.tsx`, `components/ProfileBanner.tsx`, `components/GifPicker.tsx`, `components/ColorSwatchRow.tsx`, `lib/profileCustomization.ts` (`resolveColor`, `accentGradient`, `TAGLINE_MAX`, `bioMaxFor`), `lib/tenor.ts` (`TenorResult`), `components/PaywallModal.tsx`, `hooks/useSubscription.ts`.

## Key facts (verified)

- `firestore.rules` `/users/{uid}` (lines 18–48): `lockedEntitlementFields()` = subscriptionTier/subscriptionExpiresAt/subscriptionUpdatedAt (Admin-SDK-only). The owner-update branch (lines 31–36) currently allows the owner to change any field EXCEPT those locked ones. `resource.data` is the stored doc; rules v2 supports `resource.data.get('subscriptionTier', 'free')`.
- `rules-test/test.js`: node script with `check(name, promise)` + `assertSucceeds`/`assertFails`, `seed()` writes docs via `testEnv.withSecurityRulesDisabled` (admin). Seeds `users/alice` and `users/bob` as `subscriptionTier: 'free'`. Contexts via `testEnv.authenticatedContext('name').firestore()`. Run: `npm run test:rules` (= `firebase emulators:exec --only firestore "node rules-test/test.js"`).
- Customization user-doc fields (all optional): `avatarGifUrl, avatarStillUrl, bannerGifUrl, bannerStillUrl, decorationId, tagline, profileAccent, nameColor`. (`decorationId` isn't built yet — Plan 3 — but include it in the rule's gated set now so it's covered when it lands.)
- expo-router is file-based; a new `app/customize-profile.tsx` auto-registers, but `app/_layout.tsx` has a root redirect + an `inModal`/allowlist + explicit `<Stack.Screen>` registrations (see how `join/[code]` and other non-tab routes are registered) — a new route likely must be added there or the redirect bounces it.

## File Structure

- **Modify** `firestore.rules` — add `proCustomFields()` + gate the owner-update branch.
- **Modify** `rules-test/test.js` — seed a Pro user; add Pro-gate cases.
- **Create** `components/ProfilePreviewCard.tsx` — presentational preview of a draft. Test `__tests__/ui/ProfilePreviewCard.test.tsx`.
- **Create** `app/customize-profile.tsx` — the Customize screen.
- **Modify** `app/(tabs)/profile.tsx` — add a "Customize" entry button.
- **Modify** `app/_layout.tsx` — register the route if needed.

---

### Task 1: Server-side Pro-gate rule + rules tests

**Files:** Modify `firestore.rules`; Modify `rules-test/test.js`.

- [ ] **Step 1: Add the rule.** In `firestore.rules`, add a helper next to `lockedEntitlementFields()`:

```
    // Visual customization fields that require an active Pro subscription to change.
    function proCustomFields() {
      return ['avatarGifUrl', 'avatarStillUrl', 'bannerGifUrl', 'bannerStillUrl',
              'decorationId', 'tagline', 'profileAccent', 'nameColor'];
    }
```

Then change the owner branch of `allow update` (the `request.auth.uid == uid` block) to also require Pro when any pro field changes:

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

(Leave the "anyone else / social fields" branch and create/delete unchanged.)

- [ ] **Step 2: Add a Pro user to `seed()`** in `rules-test/test.js` (inside the `withSecurityRulesDisabled` block, alongside the alice/bob seeds):

```js
      await setDoc(doc(db, 'users/prouser'), {
        displayName: 'Pro', subscriptionTier: 'pro', friends: [], friendRequests: [], blockedUsers: [],
      });
```

And add a context near the other contexts (top of the IIFE, by `const alice = …`):

```js
  const prouser = testEnv.authenticatedContext('prouser').firestore();
```

- [ ] **Step 3: Add the test cases** (place them with the other `/users` `check(...)` calls, after a `await seed();`):

```js
  await seed();
  await check('free owner CANNOT set nameColor',
    assertFails(updateDoc(doc(alice, 'users/alice'), { nameColor: 'crimson' })));
  await check('free owner CANNOT set avatarGifUrl',
    assertFails(updateDoc(doc(alice, 'users/alice'), { avatarGifUrl: 'https://t/x.gif' })));
  await check('free owner CANNOT set tagline',
    assertFails(updateDoc(doc(alice, 'users/alice'), { tagline: 'hi' })));
  await check('free owner CAN still edit bio (free field)',
    assertSucceeds(updateDoc(doc(alice, 'users/alice'), { bio: 'hello' })));
  await check('free owner CAN still edit displayName',
    assertSucceeds(updateDoc(doc(alice, 'users/alice'), { displayName: 'Alice A.' })));
  await check('pro owner CAN set nameColor + accent + tagline',
    assertSucceeds(updateDoc(doc(prouser, 'users/prouser'),
      { nameColor: 'crimson', profileAccent: 'teal', tagline: 'here for it' })));
  await check('pro owner CAN set avatar/banner gif fields',
    assertSucceeds(updateDoc(doc(prouser, 'users/prouser'),
      { avatarGifUrl: 'https://t/a.gif', avatarStillUrl: 'https://t/a.png',
        bannerGifUrl: 'https://t/b.gif', bannerStillUrl: 'https://t/b.png' })));
  await check('nobody can self-assign subscriptionTier',
    assertFails(updateDoc(doc(alice, 'users/alice'), { subscriptionTier: 'pro' })));
```

- [ ] **Step 4: Run the rules tests** — `npm run test:rules`. Expected: the new checks PASS and no prior checks regress (final line reports `passed=N failed=0`).

  **If the Firestore emulator cannot start in this environment** (e.g. Java/`JAVA_HOME` not available to the subagent), do NOT mark this failed: verify the `firestore.rules` file still has valid syntax (`firebase deploy --only firestore:rules --dry-run` if available, else careful manual review), report status **DONE_WITH_CONCERNS** noting the emulator couldn't run here and that `npm run test:rules` must be run by the human. Do not skip writing the tests.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules rules-test/test.js
git commit -m "feat(rules): gate Pro customization fields behind subscriptionTier==pro"
```

> DEPLOY NOTE (not part of this task): the rule only takes effect after `firebase deploy --only firestore:rules`. Record this in the report; it is a human step.

---

### Task 2: `components/ProfilePreviewCard.tsx` — live preview card

**Files:** Create `components/ProfilePreviewCard.tsx`; Test `__tests__/ui/ProfilePreviewCard.test.tsx`.

**Design:** Presentational. Given a `draft`, renders a compact profile card: banner (animated) at top, avatar (animated) overlapping, display name in `nameColor`, tagline in accent, bio in accent, and an accent gradient behind. Reuses `<Avatar>` + `<ProfileBanner>` + `resolveColor`/`accentGradient`. No data fetching, no persistence.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/ui/ProfilePreviewCard.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ProfilePreviewCard from '../../components/ProfilePreviewCard';
import { PROFILE_COLORS } from '../../lib/profileCustomization';

const base = { displayName: 'Amina', bio: 'hello world' };

describe('ProfilePreviewCard', () => {
  it('renders the display name and bio', () => {
    render(<ProfilePreviewCard draft={base} />);
    expect(screen.getByText('Amina')).toBeOnTheScreen();
    expect(screen.getByText('hello world')).toBeOnTheScreen();
  });

  it('shows the tagline when set', () => {
    render(<ProfilePreviewCard draft={{ ...base, tagline: 'here for the food' }} />);
    expect(screen.getByText('here for the food')).toBeOnTheScreen();
  });

  it('applies the chosen name color to the display name', () => {
    const key = PROFILE_COLORS[0].key;
    render(<ProfilePreviewCard draft={{ ...base, nameColor: key }} />);
    const nameNode = screen.getByText('Amina');
    const flat = Array.isArray(nameNode.props.style)
      ? Object.assign({}, ...nameNode.props.style.filter(Boolean))
      : nameNode.props.style;
    expect(flat.color).toBe(PROFILE_COLORS[0].value);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```tsx
// components/ProfilePreviewCard.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from './Avatar';
import ProfileBanner from './ProfileBanner';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { resolveColor, accentGradient } from '../lib/profileCustomization';

export type ProfileDraft = {
  displayName?: string;
  avatarUrl?: string;
  avatarGifUrl?: string;
  avatarStillUrl?: string;
  bannerGifUrl?: string;
  bannerStillUrl?: string;
  tagline?: string;
  bio?: string;
  profileAccent?: string;
  nameColor?: string;
};

export default function ProfilePreviewCard({ draft }: { draft: ProfileDraft }) {
  const accentValue = resolveColor(draft.profileAccent);
  const nameColorValue = resolveColor(draft.nameColor);

  return (
    <View style={styles.card} testID="profile-preview-card">
      <ProfileBanner
        gifUrl={draft.bannerGifUrl}
        stillUrl={draft.bannerStillUrl}
        animated
        height={110}
      />
      <View style={styles.body}>
        {accentValue ? (
          <LinearGradient
            colors={accentGradient(accentValue)}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        ) : null}
        <View style={styles.avatarRing}>
          <Avatar
            name={draft.displayName}
            uploadUrl={draft.avatarUrl}
            gifUrl={draft.avatarGifUrl}
            stillUrl={draft.avatarStillUrl}
            animated
            imageStyle={styles.avatarImage}
            fallbackStyle={styles.avatarFallback}
            initialStyle={styles.avatarInitial}
          />
        </View>
        <Text style={[styles.name, nameColorValue ? { color: nameColorValue } : null]} numberOfLines={1}>
          {draft.displayName || 'Your name'}
        </Text>
        {draft.tagline ? (
          <Text style={[styles.tagline, accentValue ? { color: accentValue } : null]} numberOfLines={1}>
            {draft.tagline}
          </Text>
        ) : null}
        {draft.bio ? (
          <Text style={[styles.bio, accentValue ? { color: accentValue } : null]} numberOfLines={2}>
            {draft.bio}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const AVATAR = 64;
const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border ?? Colors.textMuted },
  body: { alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, marginTop: -AVATAR / 2 },
  avatarRing: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: 'hidden', borderWidth: 2, borderColor: Colors.background, backgroundColor: Colors.surface },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  avatarInitial: { fontSize: AVATAR * 0.42, color: Colors.text, fontWeight: '700' },
  name: { marginTop: Spacing.sm, fontSize: FontSize.lg, fontWeight: FontWeight?.heavy ?? '800', color: Colors.text },
  tagline: { marginTop: 2, fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic' },
  bio: { marginTop: Spacing.xs, fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
});
```

- [ ] **Step 4: Run, expect PASS (3 tests)**, then `npx tsc --noEmit`. If any theme token is missing (`Colors.border`, `FontWeight.heavy`, etc.), substitute the closest existing token (the `?? …` fallbacks handle the obvious ones — replace them with real tokens if tsc complains). Note substitutions.

- [ ] **Step 5: Commit**

```bash
git add components/ProfilePreviewCard.tsx __tests__/ui/ProfilePreviewCard.test.tsx
git commit -m "feat(profile): add ProfilePreviewCard for live customization preview"
```

---

### Task 3: `app/customize-profile.tsx` — the try-before-buy screen

**Files:** Create `app/customize-profile.tsx`.

**Rationale on testing:** screens in this repo are verified via `tsc` + the app (only `components/` + `lib/` get unit tests). This task adds no unit test; the preview logic it relies on is already tested in Task 2. Verify with `tsc` + full suite (no regressions) + the manual checklist.

- [ ] **Step 1: Implement the screen.** Model the data-load + `uid` handling on `app/(tabs)/profile.tsx`. The screen: loads the user doc into a `draft`, renders `<ProfilePreviewCard draft={draft}>` live, exposes controls that mutate `draft` (open to everyone), and an Apply that persists for Pro / paywalls for free.

```tsx
// app/customize-profile.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../lib/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import { useToast } from '../components/Toast';
import { useSubscription } from '../hooks/useSubscription';
import ProfilePreviewCard, { ProfileDraft } from '../components/ProfilePreviewCard';
import GifPicker from '../components/GifPicker';
import ColorSwatchRow from '../components/ColorSwatchRow';
import PaywallModal from '../components/PaywallModal';
import { TenorResult } from '../lib/tenor';
import { TAGLINE_MAX } from '../lib/profileCustomization';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

export default function CustomizeProfileScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { isPro } = useSubscription();
  const [uid, setUid] = useState(auth.currentUser?.uid || '');
  const [draft, setDraft] = useState<ProfileDraft>({});
  const [gifTarget, setGifTarget] = useState<null | 'avatar' | 'banner'>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setUid(user.uid);
      const snap = await getDoc(doc(db, 'users', user.uid));
      const d = snap.data() || {};
      setDraft({
        displayName: d.displayName,
        avatarUrl: d.avatarUrl,
        avatarGifUrl: d.avatarGifUrl,
        avatarStillUrl: d.avatarStillUrl,
        bannerGifUrl: d.bannerGifUrl,
        bannerStillUrl: d.bannerStillUrl,
        tagline: d.tagline || '',
        bio: d.bio,
        profileAccent: d.profileAccent || undefined,
        nameColor: d.nameColor || undefined,
      });
    });
    return unsub;
  }, []);

  const onGifSelected = useCallback((result: TenorResult) => {
    setDraft((prev) =>
      gifTarget === 'avatar'
        ? { ...prev, avatarGifUrl: result.gifUrl, avatarStillUrl: result.stillUrl }
        : { ...prev, bannerGifUrl: result.gifUrl, bannerStillUrl: result.stillUrl }
    );
    setGifTarget(null);
  }, [gifTarget]);

  const onApply = useCallback(async () => {
    if (!isPro) {
      setShowPaywall(true);
      return;
    }
    if (!uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        avatarGifUrl: draft.avatarGifUrl ?? '',
        avatarStillUrl: draft.avatarStillUrl ?? '',
        bannerGifUrl: draft.bannerGifUrl ?? '',
        bannerStillUrl: draft.bannerStillUrl ?? '',
        tagline: (draft.tagline ?? '').trim(),
        profileAccent: draft.profileAccent ?? '',
        nameColor: draft.nameColor ?? '',
      });
      showToast('Customization applied!');
      router.back();
    } catch {
      showToast('Failed to apply', 'error');
    } finally {
      setSaving(false);
    }
  }, [isPro, uid, draft, showToast, router]);

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Customize your profile</Text>
        <ProfilePreviewCard draft={draft} />

        <TouchableOpacity style={styles.control} onPress={() => setGifTarget('avatar')} testID="pick-avatar-gif">
          <Ionicons name="image-outline" size={18} color={Colors.text} />
          <Text style={styles.controlText}>Choose animated avatar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.control} onPress={() => setGifTarget('banner')} testID="pick-banner-gif">
          <Ionicons name="images-outline" size={18} color={Colors.text} />
          <Text style={styles.controlText}>Choose banner</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Tagline</Text>
        <TextInput
          testID="customize-tagline"
          value={draft.tagline}
          onChangeText={(t) => setDraft((p) => ({ ...p, tagline: t }))}
          placeholder="A short line under your name"
          placeholderTextColor={Colors.textMuted}
          maxLength={TAGLINE_MAX}
          style={styles.input}
        />

        <Text style={styles.label}>Name color</Text>
        <ColorSwatchRow selectedKey={draft.nameColor} onSelect={(k) => setDraft((p) => ({ ...p, nameColor: k }))} />

        <Text style={styles.label}>Profile accent</Text>
        <ColorSwatchRow selectedKey={draft.profileAccent} onSelect={(k) => setDraft((p) => ({ ...p, profileAccent: k }))} />

        <TouchableOpacity
          style={[styles.apply, saving && { opacity: 0.6 }]}
          onPress={onApply}
          disabled={saving}
          testID="customize-apply"
        >
          <Text style={styles.applyText}>{isPro ? 'Apply changes' : 'Unlock with Pro'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <GifPicker visible={gifTarget !== null} onSelect={onGifSelected} onClose={() => setGifTarget(null)} />
      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason="Upgrade to Pro to apply your custom avatar, banner, colors & tagline."
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md, gap: Spacing.sm },
  heading: { fontSize: FontSize.xl, fontWeight: FontWeight?.heavy ?? '800', color: Colors.text, marginBottom: Spacing.sm },
  control: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.md },
  controlText: { color: Colors.text, fontSize: FontSize.md },
  label: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: Spacing.sm },
  input: { backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, color: Colors.text },
  apply: { marginTop: Spacing.lg, backgroundColor: Colors.text, borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center' },
  applyText: { color: Colors.background, fontSize: FontSize.md, fontWeight: '700' },
});
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean (substitute any missing theme token, e.g. `FontSize.xl`/`FontSize.md`/`Radius.md` — use the closest existing ones and note it); `npx jest` full suite green. Confirm `ScreenWrapper` and `useToast` import paths/exports match how `app/(tabs)/profile.tsx` imports them (adjust if different).

- [ ] **Step 3: Commit**

```bash
git add app/customize-profile.tsx
git commit -m "feat(profile): add try-before-buy Customize screen (Apply gated for free)"
```

---

### Task 4: Entry point + route registration

**Files:** Modify `app/(tabs)/profile.tsx`; possibly `app/_layout.tsx`.

- [ ] **Step 1: Add a Customize button** on the profile screen near the existing settings/edit affordances. Add a handler:

```tsx
  const goToCustomize = useCallback(() => router.push('/customize-profile' as any), [router]);
```

and a tappable control (place it beside the existing edit/settings buttons, matching their style — open the file to find that row):

```tsx
          <TouchableOpacity onPress={goToCustomize} style={styles.customizeButton} accessibilityLabel="Customize profile" testID="open-customize">
            <Ionicons name="color-wand-outline" size={18} color={Colors.text} />
          </TouchableOpacity>
```

Add a `customizeButton` style consistent with the adjacent buttons (copy the neighbor's style values).

- [ ] **Step 2: Register the route if needed.** Open `app/_layout.tsx`. If it uses an explicit `<Stack>` with `<Stack.Screen name="…">` entries and/or an `inModal`/allowlist that the root redirect checks (as done for `join/[code]`, `settings`, `social`, etc.), add `customize-profile` the same way so navigation isn't bounced by the redirect. If routes are auto-registered without an allowlist, no change is needed — verify by reading the file.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npx jest` full suite green.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/profile.tsx" app/_layout.tsx
git commit -m "feat(profile): entry point to the Customize screen"
```

---

### Task 5: Regression + manual-verify note

- [ ] **Step 1:** `npx jest` → all green (expect prior 104 + 3 ProfilePreviewCard = 107).
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** `npm run test:rules` if the emulator is available → new Pro-gate checks pass (else note human must run it).
- [ ] **Step 4:** Record manual checks: (a) FREE account opens Customize, tinkers avatar/banner/colors/tagline, sees them live in the preview card, taps "Unlock with Pro" → paywall, and NOTHING persisted (reopen profile → unchanged); (b) PRO account applies and the changes show on their real profile + others' view; (c) with no `EXPO_PUBLIC_TENOR_KEY` the pickers show the empty state; (d) after `firebase deploy --only firestore:rules`, a tampered free client write to a pro field is rejected server-side.
- [ ] **Step 5:** Commit any fixes.

---

## Self-Review

- **Spec coverage:** try-before-buy live preview with a gated Apply ✅ (Tasks 2,3 — everyone previews, free → paywall, nothing persisted); server-side Pro-gate enforcement ✅ (Task 1, with rules tests); reuses existing pickers/swatches ✅. `decorationId` is pre-covered by the rule for when Plan 3 lands. Bio stays free-editable in the existing edit modal (unchanged) and is shown read-only in the preview — consistent with "bio text is free."
- **Placeholder scan:** none; theme-token `?? …` fallbacks + "substitute closest token / confirm import path / register route if needed" are integration guardrails, each shipping concrete code.
- **Type consistency:** `ProfileDraft` defined in Task 2, imported unchanged by Task 3; `proCustomFields()` rule set matches the user-doc fields written by Task 3's Apply and by Plans 2/4; `<GifPicker>`/`<ColorSwatchRow>`/`<PaywallModal>`/`<ProfileBanner>`/`<Avatar>` props match their definitions from earlier plans.
- **Known redundancy (accepted):** Plan-2's inline avatar-GIF Alert + banner-edit button persist immediately (Pro path), separate from this screen's draft/Apply. Left in place to avoid churn; a later cleanup could route them here.
