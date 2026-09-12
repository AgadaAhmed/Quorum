# Places Tab + Map — Design Spec

**Date:** 2026-09-12
**Status:** Draft for review (written while user was away — see "Open Decisions" at the end; nothing here is final until Ahmed reviews)
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

**Places lives as a mode inside the Discover tab, not a new tab.** Discover gets a top segmented control:

```
[ Happening ]   [ Places ]        (Places has a  list ⇄ map  toggle)
```

- **Happening** = today's Discover feed (public plans nearby). Unchanged.
- **Places** = new venue browser. A list/map toggle switches between a photo-card list and the map (Feature C). Both render the same venue data set.

Rationale vs. a standalone 5th tab: Discover already owns "find something near me," including location permission and geo math. Reusing it keeps the tab bar at four, avoids duplicate location logic, and keeps "browse plans" and "browse places" side by side where users expect them. (Alternative — a dedicated **Places** tab — is viable if the segmented control feels cramped; noted in Open Decisions.)

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

- `react-native-maps` (Google provider) with a **custom map-style JSON** for a clean, Snapchat-adjacent look (muted palette, reduced clutter, rounded feel).
- Pins = the same venues returned by the Places search, centered on the user's location/city. Tapping a pin opens a **venue preview card** → "Start a plan here" → auto-quorum.
- Requires a **Google Maps API key** in native config and an **EAS dev build** (won't run in Expo Go; the existing `android/` project supports it).
- (Mapbox is the richer-styling alternative but heavier to wire; start with `react-native-maps`.)

## 5. Auto-Quorum Flow

```
Places (list or map)
      │  tap venue / pin
      ▼
Venue preview card  ──►  "Start a plan here"
      │  navigate to create-plan with params
      ▼
create-plan (existing screen), pre-filled:
   • title        = venue name (editable, e.g. "Drinks at {name}")
   • location     = venue name + address
   • lat / lng    = from place (no geocode needed)
   • category     = mapped from Google place types
   • place        = { placeId, name, address, lat, lng, photoRef, source, featured }
   User sets:  date + time,  requiredVotes.
   User invites: friends / share link / group  (existing flow)
      ▼
Plan created in Firestore (now carrying structured `place`)
```

Seeding reuses the `applyTemplate()` pattern — a venue is passed as route params and applied to form state on mount. No parallel creation path.

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

- `app/(tabs)/discover.tsx` — add segmented control (Happening / Places) + list⇄map toggle.
- `components/places/PlaceCard.tsx` — photo card (name, category, rating, distance, "featured" ribbon slot).
- `components/places/PlacesList.tsx` — category filter + list of `PlaceCard`.
- `components/places/PlacesMap.tsx` — `react-native-maps` view, custom style, venue pins, preview card.
- `lib/places.ts` — client wrapper calling the proxy; maps Google types → Quorum categories.
- `functions/index.js` — add `placesSearch`, `placeDetails`, `placePhoto` callable/HTTPS functions + Firestore cache + (stub) featured-injection point.
- `app/create-plan.tsx` — accept `place` route params; apply via the template-seed pattern; persist `place` on submit.
- Native/config — Google Maps key; `react-native-maps` install; EAS dev build.

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

## Open Decisions (need Ahmed's call on return)

1. **Discover-mode vs. dedicated Places tab** — spec assumes a segmented control inside Discover. OK, or do you want Places as its own 5th tab?
2. **Map library** — `react-native-maps` (assumed) vs. Mapbox (closer to Snapchat's look, more setup).
3. **Places source** — Google (assumed) vs. Foursquare (friendlier photo terms). Affects cost.
4. **Existing paywall/plan-limit** — under "everything free," should the `PaywallModal` / `isAtPlanLimit` plan cap be removed now, or left dormant? (Out of this feature's scope but implied by the free decision.)
5. **Auto-quorum title default** — `"{category} at {venue}"`, just `"{venue}"`, or leave blank for the user?
