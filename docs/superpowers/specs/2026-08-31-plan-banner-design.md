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
- **No emojis** anywhere (labels, placeholders).
- Meaning carried by weight / size / borders / icons, not color.

## Component: `PlanBanner`

New pure-presentational component `components/PlanBanner.tsx`. No network, no
state, no side effects.

### Props

```ts
type PlanBannerVariant = 'hero' | 'card' | 'thumb';

interface PlanBannerProps {
  title: string;
  category?: string;   // one of CATEGORIES, or custom/undefined
  seed: string;        // planId — drives deterministic variation
  variant: PlanBannerVariant;
  style?: StyleProp<ViewStyle>;
}
```

### Visual recipe (all greyscale)

- **Base:** near-black → dark-grey vertical gradient (via `expo-linear-gradient`,
  already a dependency; if not, fall back to a solid dark tone). Same base tone
  for every plan — cohesion.
- **Watermark:** the category's Ionicon, sized ~70% of banner height, ~7% white
  opacity, anchored bottom-right and allowed to bleed off the edge (`overflow:
  hidden`). Offset + rotation are chosen from a small fixed set by hashing `seed`,
  so plans of the same category differ but any single plan is stable.
- **Scrim:** bottom transparent→black gradient for text legibility.
- **Eyebrow:** category name, uppercase, letter-spaced, muted grey. Omitted if no
  category.
- **Title:** bold white, up to 2 lines, ellipsized (`numberOfLines={2}`).
- **Border:** hairline using the existing `Colors.border`.

### Variants

- **`hero`** — plan-detail top. Tall (~matches current `heroCover`), large title,
  eyebrow shown.
- **`card`** — home feed + Discover cards. Compact (~matches current card cover
  height), title + eyebrow.
- **`thumb`** — the small profile plan-row thumbnail. Icon-on-tone only, no text
  (too small to be legible); watermark centered at higher opacity.

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
  - renders the title and the uppercase category eyebrow (`hero`/`card`);
  - `thumb` renders no text;
  - unknown/undefined category falls back to the default icon without throwing;
  - the hash helper is deterministic (same seed → same placement) and varies
    across seeds.
- Confirm `create-plan` still creates a plan with no cover and no dangling
  references (typecheck + existing tests).
- Keep the suite green (currently **53/53**); `npx tsc --noEmit` clean.

## Out of scope (tracked separately)

Offline indicator (#1), editable interests (#2), achievements reveal (#3), text
moderation (#4), and any remaining picture-upload issues on avatars/moments/chat
(#6) are separate work items with their own specs.
