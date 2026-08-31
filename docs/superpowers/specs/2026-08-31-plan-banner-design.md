# Plan Banner — remove cover-photo uploads, generate a monochrome banner

**Date:** 2026-08-31
**Status:** Approved (design), pending implementation plan

## Problem

Plans currently support a user-uploaded **cover photo** (`plan-covers/{planId}` in
Storage, `coverUrl` on the plan doc), shown publicly in Discover and on the home
feed. This is the single highest-risk surface for abusive imagery (porn/gore) on
a public UGC app, and reliably moderating uploaded images would require a vision
moderation service (e.g. Cloud Vision SafeSearch) behind a Storage-triggered
Cloud Function — significant new infrastructure and ongoing cost.

## Decision

**Remove cover-photo uploads entirely.** Replace every cover render site with a
generated, deterministic **monochrome banner** built from the plan's own data
(category + title). No user image ever becomes a plan cover, so the moderation
problem is eliminated rather than solved.

Scope is **covers only.** Avatars, in-plan "moments" photos, and chat images
remain user-uploaded (they are lower-risk: moments/chat are visible only to plan
participants; avatars are small and secondary). Those are explicitly out of scope
here.

## Design system constraints (hard)

- **Strictly monochrome:** black / white / grey only, no hue.
- **No emojis** anywhere (labels, placeholders, titles, any string). The
  category glyphs are **Ionicons vector icons**, not emoji characters — that is
  the only "icon" allowed. Zero emoji codepoints in any source string.
- Meaning carried by weight / size / borders / icons, not color.

## Component: `PlanBanner`

New pure-presentational component `components/PlanBanner.tsx`. No network, no
state, no side effects.

**Decorative only — no text.** Every render site already shows the plan title
(and often the category label) in its own body/heading: `SwipeablePlanCard`
(title + category), `discover` card (title + category), `plan-detail` (title
heading), and the `profile` plan-row (title beside the thumb). So the banner
must NOT render the title or category as text — that would duplicate what's
already on screen. The banner fills the old cover slot with a category **graphic**
(gradient + icon); the surrounding UI keeps showing the words. Existing overlays
at each site (status badges, countdown, pinned badge, the plan-detail floating
header) stay on top of the banner unchanged.

### Props

```ts
type PlanBannerVariant = 'hero' | 'card' | 'thumb';

interface PlanBannerProps {
  category?: string;   // one of CATEGORIES, or custom/undefined
  seed: string;        // planId — drives deterministic variation
  variant: PlanBannerVariant;
  style?: StyleProp<ViewStyle>;
}
```

### Visual recipe (all greyscale, no text)

- **Base:** near-black → dark-grey vertical gradient via `expo-linear-gradient`
  (confirmed installed, `~55.0.14`). Same base tone for every plan — cohesion.
- **Category icon:** the category's Ionicon as the visual identity, centered-ish,
  sized to the variant (below), in a mid-grey (`Colors.textDisabled` /
  `Colors.textMuted`) at a variant-specific opacity. This is the ONLY mark on the
  banner. It reads as intentional, not a faint watermark.
- **Deterministic variation:** a small `hashSeed(seed)` picks one entry from a
  fixed array of `{ dx, dy, rotate }` offsets, so two plans of the same category
  differ but any single plan is stable across renders.
- **Border:** the site's existing container border/scrim is preserved; the banner
  itself adds none beyond filling its box.
- **Accessibility:** `accessibilityLabel={`${category ?? 'Plan'} cover`}`,
  `testID="plan-banner"` for tests.

### Variants (sizing matches the cover slots being replaced)

- **`hero`** — plan-detail top. Fills `styles.heroCover` height; large icon
  (~45% of height), low-moderate opacity; floating header sits on top.
- **`card`** — home feed + Discover cards. Fills the card cover height
  (`SwipeablePlanCard` 200, discover `cardCover`); medium icon (~40% of height),
  moderate opacity; status/countdown/pinned badges sit on top.
- **`thumb`** — the small profile plan-row thumbnail. Icon centered, higher
  opacity so it reads at small size; no gradient needed (flat dark tone is fine).

### Category → icon map

No such map exists today, so `PlanBanner` introduces:

```ts
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
const DEFAULT_ICON = 'calendar'; // custom/unknown/undefined category
```

(Exact glyph names to be verified against `Ionicons.glyphMap` during
implementation.) This map lives in `PlanBanner` for now; it may later back the
category pills too, but that is out of scope.

### Determinism helper

A tiny string hash (e.g. a djb2 over `seed`) maps to an index into a fixed array
of `{ dx, dy, rotate }` watermark placements (say 6 variants). Pure function,
unit-testable.

## Changes to existing code

### `app/create-plan.tsx` — remove the cover flow

Delete: `import * as ImagePicker`, `coverUri`/`uploadingCover` state,
`handlePickCover`, the media-library permission prompt, the Storage upload block
(`fetch`→`uploadBytes`→`getDownloadURL`), the `coverUrl` field on the created
plan doc, the picker UI (`coverPicker` block) and its styles, and the
now-unused `ref/uploadBytes/getDownloadURL` / `storage` imports if nothing else
uses them. `uploadingCover` references in the submit label collapse to the normal
loading label.

### Render sites — swap image for banner

Replace each `plan.coverUrl ? <Image/> : <placeholder>` with `<PlanBanner/>`:

- `app/(tabs)/profile.tsx:134` — plan-row thumbnail → `variant="thumb"`.
- `app/plan-detail.tsx:1396` (hero) → `variant="hero"`; `:743` (inline) →
  `variant="card"`.
- Home feed card (`components/home/SwipeablePlanCard.tsx`, type in
  `components/home/shared.ts`) → `variant="card"`.
- `app/(tabs)/discover.tsx` card (the `image-outline` placeholder ~line 169) →
  `variant="card"`.

**Legacy `coverUrl` is ignored** at all sites (never read), so pre-existing
uploaded covers stop rendering — the image surface is fully removed and the look
is uniform. The `coverUrl?: string` field stays in the TS types as a deprecated,
unread remnant (no data migration).

### `storage.rules` — retire `plan-covers`

Nothing writes `plan-covers/{planId}` anymore. Tighten its `allow write` to
`false` (keep `read` for any lingering objects, or drop the block entirely).
Re-run `npm run test:rules` if the rule set is touched. Deploy with the next
rules deploy (not urgent — no client writes there anymore).

## Error handling

Net reduction: removing the upload deletes an entire failure path (permission
denial, fetch/upload errors, partial-create-without-cover). `PlanBanner` is pure
rendering and cannot fail at runtime; an unknown category falls back to
`DEFAULT_ICON` and a missing title renders an empty title area (caller already
requires a title to create a plan).

## Testing

- **New** `__tests__/ui/PlanBanner.test.tsx`:
  - renders a `plan-banner` node with an accessibility label derived from the
    category (e.g. `Music cover`);
  - unknown/undefined category renders (falls back to the default icon) without
    throwing, label `Plan cover`;
  - renders no plan-title text (guards against reintroducing duplication);
  - the exported `hashSeed` helper is deterministic (same seed → same index) and
    distributes across seeds.
- Confirm `create-plan` still creates a plan with no cover and no dangling
  references (typecheck + existing tests).
- Keep the suite green (currently **53/53**); `npx tsc --noEmit` clean.

## Out of scope (tracked separately)

Offline indicator (#1), editable interests (#2), achievements reveal (#3), text
moderation (#4), and any remaining picture-upload issues on avatars/moments/chat
(#6) are separate work items with their own specs.
