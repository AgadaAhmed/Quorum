# Places Tab + Map — Design Spec

**Date:** 2026-09-12
**Status:** Decisions locked (Ahmed, 2026-09-12 — see "Resolved Decisions"). Ready for user spec-review, then implementation plan.
**Project scope:** Feature **A** (Places tab → auto-quorum) + Feature **C** (places/events map). Feature **B** (sponsored/referral money layer) is designed-for but not built. Feature **D** (Snapchat-style friend live-location map) is explicitly deferred.

---

## 1. Background & Motivation

Quorum is going **fully free** — no paid features. The chosen philosophy: *the people coordinating never pay; someone who benefits from them showing up (a venue) can pay later.* This spec builds the surface that makes that possible while being genuinely useful on day one.

Today, creating a quorum ("plan") means typing a free-text `location`, which the app geocodes to lat/lng. This feature lets a user instead **browse real venues in their city (with photos), tap one, and auto-start a quorum** where they only set the time and the vote threshold. The same venues appear on a **map**.

Crucially, the Places surface is where the future money lives: a venue a group chooses is a referral a business would pay for, and a venue can pay to be featured. So the feature that makes Quorum more fun is the same feature that will fund the free model.

## 2. Goals / Non-Goals

**Goals**
- Browse venues in the user's city, with photos, filterable by category.
- Tap a venue → land in the existing create-plan flow with venue pre-filled; user only sets time + required votes, then invites via the existing methods (friends / link / group).
- A map view of those same venues; tap a pin → same auto-quorum flow.
- Do it without leaking the Google API key and without an uncontrolled API bill.
- Bake in a "featured/sponsored" data slot so the money layer (B) needs no rework.

**Non-Goals (this project)**
- No friend live-location on the map (Feature D — deferred; heavy + POPIA-sensitive).
- No actual sponsored-listing sales, booking integrations, or referral payouts (Feature B — data hooks only).
- No new invite mechanics — reuse what exists (code/deep-link/public, `lib/invite.ts`).
- No paid gating. In fact, the existing plan-limit paywall should be reviewed for removal under the "everything free" decision (tracked separately — see Open Decisions).

## 3. Existing System (verified)

- **Plans** are Firestore docs created in `app/create-plan.tsx`. Relevant fields: `title`, `description`, `location` (free-text), `date`, `time`, `requiredVotes`, `isPublic`, `category`, optional poll, `voteDeadline`, `maxParticipants`, `inviteCode`, and geocoded `lat`/`lng`.
- **Prefill already exists**: `applyTemplate()` seeds the form from a saved template. A venue selection reuses this exact pattern.
- **Discover tab** (`app/(tabs)/discover.tsx`) already requests location, computes distance (haversine), and renders a nearby feed with category pills. Places will live here as a mode, reusing that plumbing.
- **Cloud Functions** exist (`functions/index.js`) → home for the Places proxy.
- **Cities** are a curated static list (`lib/cities.ts`), not an API — used for the user's city selection.
- **No maps library installed** yet.

## 4. Approach (chosen)

**Places is its own dedicated tab** (user decision, 2026-09-12) — a 5th tab alongside index / discover / activity / profile. Inside it, a **list ⇄ map toggle** switches between a photo-card list and the map (Feature C); both render the same venue data set.

The tab reuses Discover's location plumbing (permission prompt, `expo-location`, haversine distance) via shared helpers rather than duplicating it, but presents as a first-class destination so "find a place → start a plan" is one obvious tap from anywhere, not buried behind a segmented control. Tab bar grows from 4 → 5 items; the center "+" create button is unaffected.

### Data source: Google Places API (New), proxied

- **Nearby/Text Search** → venues for the user's city + category.
- **Place Details** → hours, rating, address.
- **Place Photos** → card imagery.
- **All calls go through a Firebase Cloud Function** (`placesSearch`, `placeDetails`, `placePhoto`) so:
  - the API key never ships in the client,
  - we add **caching** (Firestore, keyed by `city + category + page`, TTL ≤ 30 days to respect Google's caching terms) to cut cost and latency,
  - we can rate-limit and later inject **featured** venues (Feature B) server-side.
- **Photos are fetched live** via photo reference (proxied), not permanently stored, per Google terms. We may cache a short-lived signed URL.
- **`place_id` is stored** on the plan long-term (allowed) so a plan keeps a stable venue identity.

> Cost note: this API is billed per request and is the real cost of "free." Caching + the future featured-venue revenue (B) are what keep it sustainable. If cost/photo-terms bite, **Foursquare Places** is the fallback source behind the same proxy interface.

### Map: `react-native-maps`, custom-styled

Chosen as the **free** option (user decision, 2026-09-12). On mobile, Google Maps **map display via `react-native-maps` is free** (Google no longer charges for mobile map loads); the Places *search/photos* are the only billed part, and that cost is the same regardless of map library. Mapbox's designer look is nicer but its free tier caps at a monthly active-user limit and then bills — so `react-native-maps` wins on "keep it free."

- `react-native-maps` (Google provider) with a **custom map-style JSON** for a clean, Snapchat-adjacent look (muted greyscale palette to honor the monochrome design system, reduced clutter, rounded feel).
- Pins = the same venues returned by the Places search, centered on the user's location/city. Tapping a pin opens a **venue preview card** → "Start a plan here" → the same title popup + auto-quorum as the list.
- Requires a **Google Maps API key** in native config and an **EAS dev build** (won't run in Expo Go; the existing `android/` project supports it).
- Monochrome note: the custom map style must be greyscale to match `lib/theme.ts`; pins/markers use vector icons, no emoji, per the project design rules.

## 5. Auto-Quorum Flow

```
Places (list or map)
      │  tap venue / pin
      ▼
Venue preview card  ──►  "Start a plan here"
      ▼
TITLE POPUP  (time-aware — see below)
      │  user picks/edits a suggested title
      ▼
create-plan (existing screen), pre-filled:
   • title        = chosen title (e.g. "Night at Villa Bar")
   • location     = venue name + address
   • lat / lng    = from place (no geocode needed)
   • category     = mapped from Google place types
   • place        = { placeId, name, address, lat, lng, photoRef, source, featured }
   User sets:  date + time,  requiredVotes.
   User invites: friends / share link / group  (existing flow)
      ▼
Plan created in Firestore (now carrying structured `place`)
```

Seeding reuses the `applyTemplate()` pattern — the chosen title + venue are passed as route params and applied to form state on mount. No parallel creation path.

### Time-aware title popup (user decision, 2026-09-12)

Tapping a venue opens a small popup to name the plan. The default is **not** the bare venue name — it's a **time-of-day phrasing** of it, offered as chips:

| Time bucket | Suggested title |
|---|---|
| 05:00–11:59 | **Morning at {venue}** |
| 12:00–16:59 | **Afternoon at {venue}** |
| 17:00–20:59 | **Evening at {venue}** |
| 21:00–04:59 | **Night at {venue}** |

- All four chips are shown; the **time-appropriate one is pre-selected**, plus a free-text field to type a custom title.
- **Which time drives it:** the **event time the user picks**, not the moment of creation (user decision). Since the venue is chosen *before* the date/time in this flow, the popup opens with the phrasing keyed to the **current time**, but the title **re-derives to match the event time once the user sets it** on the create-plan screen — as long as they haven't manually edited it. (If they typed a custom title, we don't overwrite it.)
- Logic lives in a pure helper `titleForTime(venueName, date)` in `lib/places.ts`, unit-tested at each bucket boundary.

This keeps the "just a venue" simplicity the user wanted, while making the plan title feel written-for-the-moment.

## 6. Data Model Changes

Add one **optional, backwards-compatible** object to plan docs (old plans without it still work):

```ts
place?: {
  placeId: string;        // Google place_id — stored long-term (allowed)
  name: string;
  address: string;
  lat: number;
  lng: number;
  photoRef?: string;      // fetched live via proxy; not a permanent URL
  source: 'google' | 'foursquare';
  featured?: boolean;     // Feature B hook — always false for now
}
```

A `venues` cache collection (server-managed, TTL) backs the proxy. No client writes to it.

## 7. Components / Files (anticipated)

- `app/(tabs)/places.tsx` — **new 5th tab**; list⇄map toggle, category filter, owns the venue data fetch.
- `app/(tabs)/_layout.tsx` — register the `places` tab (icon + `Tabs.Screen`), 4 → 5 tabs.
- `components/places/PlaceCard.tsx` — photo card (name, category, rating, distance, "featured" ribbon slot).
- `components/places/PlacesList.tsx` — category filter + list of `PlaceCard`.
- `components/places/PlacesMap.tsx` — `react-native-maps` view, custom greyscale style, venue pins, preview card.
- `components/places/TitlePopup.tsx` — the time-aware title chooser (chips + custom field) shown on venue tap.
- `lib/places.ts` — client wrapper calling the proxy; maps Google types → Quorum categories; `titleForTime(venue, date)` helper.
- `functions/index.js` — add `placesSearch`, `placeDetails`, `placePhoto` callable/HTTPS functions + Firestore cache + (stub) featured-injection point.
- `app/create-plan.tsx` — accept `place` + `title` route params; apply via the template-seed pattern; **re-derive the title from the event time on change unless user-edited**; persist `place` on submit.
- Native/config — Google Maps key; `react-native-maps` install; EAS dev build.

> Depends on the "Go Fully Free" spec (`2026-09-12-go-fully-free-design.md`): the plan-limit paywall in `create-plan.tsx` is being removed there, so the auto-quorum flow has no paywall interaction to design around.

## 8. Error Handling & Edge Cases

- **No location permission** → fall back to the user's chosen city from `lib/cities.ts`; map centers on city centroid.
- **Places API failure / quota** → show cached results if present, else a friendly "couldn't load places" with retry; the manual free-text `location` path in create-plan remains fully available (nothing removed).
- **No photo for a venue** → category placeholder image.
- **Venue outside a supported city** → search still works via lat/lng radius; city label is best-effort.
- **Cost spike protection** → server-side per-user/day call ceiling; cache-first reads.

## 9. Privacy / Compliance

- Uses only the **user's own** location (to center map / rank nearby) — same posture as today's Discover. No friend locations in this project (that's D).
- Google Places attribution requirements honored in the UI.
- POPIA/GDPR footprint is unchanged from today because no new personal data is shared externally; venue data flows one way (Google → us → user).

## 10. Testing

- Unit: category mapping (Google types → Quorum categories); cache key + TTL logic; param-seeding of create-plan.
- Function: proxy returns cached vs. fresh correctly; key never exposed; ceiling enforced.
- Integration/manual: tap venue (list & map) → create-plan prefilled → plan saved with `place` → appears in Discover with correct distance.
- Regression: existing free-text location creation still works unchanged.

## 11. Build Sequence (for the plan)

1. Places proxy Cloud Functions + Firestore cache (no UI) — verify with logs.
2. `lib/places.ts` client wrapper + category mapping.
3. Discover segmented control + `PlacesList`/`PlaceCard` (list only).
4. create-plan `place` param seeding + persistence.
5. `react-native-maps` install, key, dev build; `PlacesMap` + preview card.
6. `featured` data hook + "featured" ribbon slot (rendered, never true yet).
7. Tests + cost-ceiling + cache tuning.

## 12. Deferred / Later (not this project)

- **B — money layer:** selling featured slots, booking/referral integrations, payouts. Data hooks (`place.featured`, server injection point) are in place.
- **D — friend live-location map:** Snap-style avatars, Ghost Mode, live GPS. High effort + POPIA-heavy; revisit after B is earning.

---

## Resolved Decisions (Ahmed, 2026-09-12)

1. **Places = its own dedicated tab** (a 5th tab), not a mode inside Discover.
2. **Map library = `react-native-maps`** — chosen as the free option (mobile Google map display is free; Mapbox bills past a MAU cap).
3. **Places source = Google** now, with the Cloud-Function proxy built so **Foursquare is a drop-in fallback** if cost bites. Rationale: Google's venue/photo coverage in the target African cities is far better than Foursquare's.
4. **Paywall removed** — handled in the separate `2026-09-12-go-fully-free-design.md` spec (all Pro features become free; no paywall in the auto-quorum flow).
5. **Title = time-aware popup**, keyed to the **event time the user picks** (Morning/Afternoon/Evening/Night at {venue}), with chips + custom field. See §5.
