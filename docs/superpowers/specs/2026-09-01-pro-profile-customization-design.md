# Pro Profile Customization — Design

**Date:** 2026-09-01
**Status:** Approved (design), pending implementation plan
**Branch target:** `main` (see "Known tradeoff" re: `feature/themes`)

## Summary

A Discord/Nitro-style profile-customization suite that is the flagship **Pro** perk. It is a *deliberate, scoped exception* to Quorum's strict-monochrome design system: Pro users get color and motion **on their profile**, and nothing about the rest of the app's monochrome identity changes. This gives the paywall a real, visible, "worth paying for" hook and doubles as a conversion surface via a live try-before-buy preview.

This is the first of three related-but-independent features raised in the same brainstorm; the other two (colorful Pro app themes, and mutual-friends/recommendations) get their own specs.

## Goals

- Give Pro a tangible, high-visibility customization set that motivates upgrades.
- Let free users *see and try* the customization live before paying (conversion).
- Keep the app's monochrome identity intact everywhere except a user's own profile presentation.
- Introduce zero net-new image-moderation burden (reuse Tenor's SFW filter + existing report flow; everything else is curated by us).
- No data migration; all new fields optional.

## Non-Goals (v1)

- No arbitrary user uploads of GIFs or banner images (Tenor-sourced only; avatars keep the existing static-upload path for free users).
- No animating avatars in lists/feeds/chat/plan-cards (profile screens only).
- No draggable/rearrangeable profile layout — "how your profile looks" means **color/theme of the profile card**, not layout.
- No free-form hex color picker — colors come from a curated palette.
- No full gradient editor — gradients are 2-stop pairs from the curated palette.
- No Tenor proxy Cloud Function (client-side key is Tenor's intended usage; proxy is a later nicety).
- Colorful whole-app themes are a *separate* feature/spec (this feature themes only the user's own profile card as others see it).

## Tiering (Free vs Pro)

| Surface | Free | Pro |
|---|---|---|
| Avatar | Static uploaded image (existing) | Animated GIF from Tenor (animates on profile screens) |
| Avatar decoration | — | 1 of 3 curated overlays (cat ears / glitch frame / sparkle ring) |
| Profile banner | — (no banner) | Animated banner from Tenor |
| Bio / About-Me | Plain text, ≤150 chars | ≤300 chars + accent color |
| Tagline / status line | — | Short custom line under name |
| Profile card accent / gradient | — | Curated accent color or 2-stop gradient tinting the profile header |
| Display-name color | — | Curated color for own display name (with readability floor) |

## Feature Detail

### 1. Animated avatar (Tenor)
- Pro users, on avatar edit, choose **"Upload photo"** (existing static path) **or** **"Pick GIF"** (new Tenor picker).
- Stored as `avatarGifUrl` (animated) + `avatarStillUrl` (Tenor preview still).
- **Rendering rule:** animates on `profile.tsx` and `user-profile.tsx` only (via `expo-image`). Every other avatar surface renders `avatarStillUrl` (static first frame) — no list/feed/chat performance change.

### 2. Avatar decorations
- 3 curated transparent overlay assets shipped with the app (design deliverable: cat ears, glitch frame, sparkle ring — the third may be animated APNG for the "glitch" effect).
- Stored as `decorationId` (enum: `null | 'cat-ears' | 'glitch' | 'sparkle'`).
- Composited *over* the avatar by a new shared **`<Avatar>` component** (see Architecture). Decoration **shows everywhere** the avatar shows (it's a tiny overlay) but **animates only on profile screens**; static frame elsewhere.

### 3. Profile banner (Tenor)
- New header region at the top of `profile.tsx` / `user-profile.tsx`: a wide banner with the avatar overlapping it (Discord-style). This is the *one* colorful element on the profile; name/stats/everything below stay strictly monochrome.
- Free users (and Pro users who haven't set one) see the current no-banner layout — the header must reflow gracefully with and without a banner.
- Stored as `bannerGifUrl` + `bannerStillUrl`. Animates on profile screens only.

### 4. Bio / About-Me
- Free-form text block on the profile. **Text is free** (≤150 chars). Pro unlocks longer (≤300) and applying the profile accent color to it.
- Stored as `bio` (string). Length/color enforcement in UI + validated in the write path.

### 5. Tagline / status line
- Short Pro-only line under the display name (≤60 chars). Stored as `tagline`.

### 6. Profile card accent / gradient
- Pro picks a **curated accent color** or a **2-stop gradient** (curated pairs) that tints *their* profile header/card as **others** see it. This is distinct from the separate whole-app Themes feature.
- Stored as `profileAccent` (a palette key, or a pair key for gradients).

### 7. Display-name color
- Pro colors their own display name from the curated palette. **Readability floor:** because names render on varying backgrounds, colors come from a curated set chosen to stay legible on both light and dark surfaces (no arbitrary hex). Stored as `nameColor` (palette key).

### 8. Live preview = paywall showcase
- The customization editor **is** the preview: free users can open it (from Profile edit and from a "See what Pro looks like" entry on the paywall), tinker with pfp/banner/decoration/colors/bio/tagline, and see them applied to their real profile in real time.
- **Apply/Save is Pro-gated** — tapping it while free opens the paywall. No separate static marketing screen is built; this editor serves both purposes.

## Architecture

### New shared component: `<Avatar>`
Avatars are currently rendered inline in ~7 files (`app/(tabs)/index.tsx`, `activity.tsx`, `profile.tsx`, `app/chat.tsx`, `plan-detail.tsx`, `user-profile.tsx`, `components/MomentsGallery.tsx`). Introduce a single `components/Avatar.tsx` that all sites use:
- Props: `user` (or the relevant fields), `size`, `animated?: boolean` (default false → still frame; profile screens pass `true`).
- Responsibilities: pick source (gif vs still vs uploaded `avatarUrl` vs initials fallback), composite the decoration overlay, render via `expo-image`.
- This is required for consistent decoration compositing and is good hygiene regardless.

### New modules
- `lib/tenor.ts` — Tenor search + trending. **Always** sends `contentfilter=high`. Requests both an animated format and a preview still; returns `{ gifUrl, stillUrl, dims }`. Uses `EXPO_PUBLIC_TENOR_KEY`.
- `components/GifPicker.tsx` — modal with trending grid + search, calls back with the selected `{ gifUrl, stillUrl, dims }`. Reused for both avatar and banner picking.
- `lib/profileCustomization.ts` (or similar) — the curated color palette (accents, gradient pairs, name colors, each with light/dark legibility guarantees), the decoration registry (id → asset + whether animated), and validation helpers (bio/tagline length, Pro-gating checks).

### Rendering
- `expo-image` (`~55.0.11`, already installed) renders animated GIF/WebP/APNG efficiently and is used inside `<Avatar>` and the banner.
- Profile screens pass `animated`; everywhere else uses stills.

## Data Model (Firestore `users/{uid}`)

All new fields optional; no migration.

- `avatarGifUrl?: string`, `avatarStillUrl?: string`
- `bannerGifUrl?: string`, `bannerStillUrl?: string`
- `decorationId?: 'cat-ears' | 'glitch' | 'sparkle'`
- `bio?: string`
- `tagline?: string`
- `profileAccent?: string` (palette/pair key)
- `nameColor?: string` (palette key)

**Display precedence for avatar:** `avatarGifUrl` (profile) / `avatarStillUrl` (elsewhere) → `avatarUrl` (existing upload) → initials.

## Moderation

- **pfp/banner:** Tenor `contentfilter=high` is the gate (moderation happens provider-side). The existing **report → remove** flow is the human backstop; when a pfp/banner is actioned, the field is cleared.
- **decorations / colors:** curated by us — no moderation needed.
- Net-new moderation burden: effectively zero.

## Enforcement

- **UI-gate:** all Pro surfaces gated in the editor; Apply → paywall for free users.
- **Server-side (recommended):** a Firestore rule on `users/{uid}` update allowing the customization fields (`avatarGifUrl`, `bannerGifUrl`, `decorationId`, `tagline`, `profileAccent`, `nameColor`, and the Pro bio length/color) to persist **only when** `subscriptionTier == 'pro'`. Consistent with how subscription is already enforced server-side elsewhere. `bio` (free plain-text ≤150) remains writable by any owner.

## Testing

- `lib/tenor.ts`: URL building, `contentfilter=high` **always** present, response parsing to `{ gifUrl, stillUrl, dims }`.
- `GifPicker`: renders results, `onSelect` returns still + gif.
- `<Avatar>`: source precedence (gif/still/upload/initials), decoration compositing, `animated` flag → gif vs still.
- `lib/profileCustomization.ts`: bio/tagline length validation, palette keys resolve, Pro-gating helper.
- Firestore rules test (if the server-side rule is added): non-Pro cannot persist gated fields; Pro can; free bio still writable.

## Known Tradeoff

Built on `main` now, per decision. `profile.tsx` and `user-profile.tsx` are also heavily rewritten on the unmerged `feature/themes` branch (22 commits). Expect a **manual merge-conflict resolution** in those two files when `feature/themes` lands. Accepted.

## Dependencies / Prerequisites

- A free **Tenor API key** (Google) → `EXPO_PUBLIC_TENOR_KEY`.
- **3 decoration assets** (transparent PNG, one possibly APNG for glitch) — a design deliverable, needed before the decoration UI is fully real (rendering engine can be built/tested against placeholders first).

## Interaction With In-Flight Work

- **Paywall:** this adds genuine new Pro perks — fits the "paywall honesty" ethos. `PaywallModal.tsx` is mid-flux (themes branch + pending ZAR-pricing rework), so the paywall copy update for these perks should be sequenced to avoid concurrent edits.
- **Themes feature:** separate; that recolors the whole app for a Pro user. This feature only themes the user's own profile card as others see it.

## Open Follow-ups (separate specs)

1. Colorful Pro app themes (`lib/theme.ts` palettes; "go colorful" direction).
2. Mutual friends + recommendations (people-you-may-know + friend-driven plan recs; free).
