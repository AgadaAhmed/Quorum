# Places — Plan A (Data + Places Tab + Auto-Quorum + Discover Integration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users browse real venues (with photos) in a chosen city, tap one to auto-start a quorum with a time-aware title, and surface the same venues in a Discover carousel — all served through a cost-controlled Google Places proxy.

**Architecture:** A Firebase Cloud Function proxies Google Places API (New) so the API key never ships to the client and results are cached in Firestore. A pure client module (`lib/places.ts`) holds the types, category mapping, and the time-aware title helper, plus a thin callable wrapper. UI: a new dedicated **Places tab** (list) and a **Discover carousel + location switcher**, both feeding the existing `create-plan` flow via route params. The map view is deliberately **out of scope for Plan A** (it needs native config + a dev build — that's Plan B).

**Tech Stack:** TypeScript, Expo/React Native, expo-router, Firebase (Firestore + Cloud Functions gen-2, nodejs22), Google Places API (New), Jest (`jest-expo`), `@testing-library/react-native`.

**Scope boundaries:**
- IN: proxy functions, `lib/places.ts`, Places tab (list + category filter), `TitlePopup`, create-plan seeding + `place` persistence, Discover `PlacesCarousel` + `LocationSwitcher`, `place.featured` data hook (rendered ribbon, never true).
- OUT (Plan B): `react-native-maps`, map view, map pins, native Maps key, EAS dev build.
- DEPENDS ON (user-owned, needed only to run live — NOT to build/test the mocked code): Places API (New) enabled on `quorum-323e1`; a server API key set as the `PLACES_API_KEY` function secret; `firebase deploy --only functions`.

**Design rules for this repo (must follow):** UI is strictly monochrome (greys only; the single allowed accent `Colors.accent` is celebration-only — do not use it here). NO emoji anywhere. Use Ionicons vector icons. Styles via `useThemedStyles(makeStyles)` + `useTheme()` with a `Colors: ThemePalette` param named `Colors`. New route screens cast router params `as any` per repo convention only where `.expo/types` hasn't regenerated.

---

## Task 1: Pure client helpers in `lib/places.ts` (types, category map, time-aware title)

**Files:**
- Create: `lib/places.ts`
- Create test: `__tests__/places.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/places.test.ts`:

```ts
import {
  titleForTime,
  titlePartForDate,
  TIME_TITLE_PARTS,
  mapGoogleTypesToCategory,
  type Place,
} from '../lib/places';

describe('titlePartForDate', () => {
  const at = (h: number) => new Date(2026, 0, 1, h, 0, 0);
  it('maps hours to the right part', () => {
    expect(titlePartForDate(at(5))).toBe('Morning');
    expect(titlePartForDate(at(11))).toBe('Morning');
    expect(titlePartForDate(at(12))).toBe('Afternoon');
    expect(titlePartForDate(at(16))).toBe('Afternoon');
    expect(titlePartForDate(at(17))).toBe('Evening');
    expect(titlePartForDate(at(20))).toBe('Evening');
    expect(titlePartForDate(at(21))).toBe('Night');
    expect(titlePartForDate(at(23))).toBe('Night');
    expect(titlePartForDate(at(0))).toBe('Night');
    expect(titlePartForDate(at(4))).toBe('Night');
  });
});

describe('titleForTime', () => {
  it('formats "<Part> at <Venue>"', () => {
    expect(titleForTime('Villa Bar', new Date(2026, 0, 1, 21, 0))).toBe('Night at Villa Bar');
    expect(titleForTime('Cafe Neo', new Date(2026, 0, 1, 9, 0))).toBe('Morning at Cafe Neo');
  });
  it('exposes all four parts', () => {
    expect(TIME_TITLE_PARTS).toEqual(['Morning', 'Afternoon', 'Evening', 'Night']);
  });
});

describe('mapGoogleTypesToCategory', () => {
  it('maps known types to app categories', () => {
    expect(mapGoogleTypesToCategory(['bar'])).toBe('Party');
    expect(mapGoogleTypesToCategory(['night_club'])).toBe('Party');
    expect(mapGoogleTypesToCategory(['restaurant'])).toBe('Food');
    expect(mapGoogleTypesToCategory(['cafe', 'food'])).toBe('Food');
    expect(mapGoogleTypesToCategory(['gym'])).toBe('Sports');
    expect(mapGoogleTypesToCategory(['museum'])).toBe('Art');
    expect(mapGoogleTypesToCategory(['library'])).toBe('Study');
    expect(mapGoogleTypesToCategory(['park'])).toBe('Travel');
  });
  it('returns empty string for unknown/empty', () => {
    expect(mapGoogleTypesToCategory(['plumber'])).toBe('');
    expect(mapGoogleTypesToCategory([])).toBe('');
    expect(mapGoogleTypesToCategory(undefined as any)).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest __tests__/places.test.ts`
Expected: FAIL — `lib/places.ts` doesn't exist.

- [ ] **Step 3: Implement `lib/places.ts` (pure parts only for this task)**

```ts
// Client-side Places helpers. Pure logic only in this file's top section;
// the network wrapper (searchPlaces / placePhotoUrl) is added in Task 3.

export interface Place {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;      // mapped app category ('' if none)
  rating?: number;
  photoRef?: string;     // Google photo resource name, resolved via the proxy
  featured?: boolean;    // Feature B hook — always false in Plan A
  source: 'google';
}

export const TIME_TITLE_PARTS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;
export type TitlePart = (typeof TIME_TITLE_PARTS)[number];

/** Bucket an hour-of-day into a greeting part. 5-12 Morning, 12-17 Afternoon,
 *  17-21 Evening, 21-5 Night. */
export function titlePartForDate(when: Date): TitlePart {
  const h = when.getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Night';
}

export function titleForTime(venueName: string, when: Date): string {
  return `${titlePartForDate(when)} at ${venueName}`;
}

/** Map Google Places (New) type strings to Quorum's plan categories.
 *  Returns '' when nothing matches (plan category then left blank). */
export function mapGoogleTypesToCategory(types: string[] = []): string {
  const t = new Set(types || []);
  if (t.has('bar') || t.has('night_club')) return 'Party';
  if (t.has('restaurant') || t.has('cafe') || t.has('bakery') || t.has('meal_takeaway') || t.has('food')) return 'Food';
  if (t.has('gym') || t.has('stadium') || t.has('sports_complex')) return 'Sports';
  if (t.has('art_gallery') || t.has('museum')) return 'Art';
  if (t.has('movie_theater') || t.has('amusement_park') || t.has('bowling_alley')) return 'Party';
  if (t.has('library') || t.has('university') || t.has('book_store')) return 'Study';
  if (t.has('tourist_attraction') || t.has('park') || t.has('lodging')) return 'Travel';
  return '';
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest __tests__/places.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/places.ts __tests__/places.test.ts
git commit -m "feat(places): pure helpers — types, category map, time-aware title"
```

---

## Task 2: Cloud Function proxy for Google Places (New) + Firestore cache

**Files:**
- Modify: `functions/index.js` (add callables `placesSearch`, `placePhoto`)
- Modify: `functions/package.json` (ensure a fetch is available — Node 22 has global `fetch`, so no dep needed; confirm)

**Context:** Functions are gen-2, nodejs22, using `firebase-functions` v2 (existing callables: `joinPlanByCode`, `checkUsername`, `revenuecatWebhook`, `onUserUpdate`, `onPlanUpdate`, `onChatMessage`). Node 22 has global `fetch`, so call Google directly. The API key comes from a secret `PLACES_API_KEY` (never hardcode). This task cannot be end-to-end tested without the key — verify structure with `node --check`, keep the code defensive, and mark a DEPLOY-VERIFY step.

- [ ] **Step 1: Add the secret + `placesSearch` callable**

At the top of `functions/index.js`, alongside the other v2 imports, ensure you have `onCall`, `HttpsError`, and add the secret:

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const PLACES_API_KEY = defineSecret('PLACES_API_KEY');
```

(If `onCall`/`HttpsError` are already imported for the existing callables, reuse them — don't duplicate.)

Add this callable (uses `admin.firestore()` — the file already initializes `admin`):

```js
// ── Places proxy ─────────────────────────────────────────────────────────────
// Proxies Google Places API (New) so the key stays server-side, caches results
// in Firestore (per rounded location + category), and enforces a per-user daily
// call ceiling to cap cost. Photos are resolved separately via placePhoto.

const PLACES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (Google allows <=30)
const PLACES_DAILY_CAP = 300;                        // per-user Google calls/day

// App-category -> Google (New) includedTypes for Nearby Search.
const CATEGORY_TO_TYPES = {
  Food:   ['restaurant', 'cafe', 'bakery'],
  Party:  ['bar', 'night_club'],
  Sports: ['gym', 'stadium'],
  Art:    ['art_gallery', 'museum'],
  Study:  ['library', 'book_store'],
  Travel: ['tourist_attraction', 'park'],
};

function placesCacheKey(lat, lng, category) {
  // ~110m granularity keeps the cache useful without being coarse.
  const r = (n) => Math.round(n * 1000) / 1000;
  return `${r(lat)}_${r(lng)}_${category || 'all'}`;
}

exports.placesSearch = onCall({ secrets: [PLACES_API_KEY] }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const lat = Number(req.data && req.data.lat);
  const lng = Number(req.data && req.data.lng);
  const category = typeof req.data?.category === 'string' ? req.data.category : '';
  if (!isFinite(lat) || !isFinite(lng)) {
    throw new HttpsError('invalid-argument', 'lat and lng are required numbers.');
  }

  const dbf = admin.firestore();
  const cacheRef = dbf.doc(`venuesCache/${placesCacheKey(lat, lng, category)}`);
  const cached = await cacheRef.get();
  if (cached.exists) {
    const data = cached.data();
    if (data.fetchedAt && Date.now() - data.fetchedAt.toMillis() < PLACES_CACHE_TTL_MS) {
      return { places: data.places || [], cached: true };
    }
  }

  // Daily ceiling (best-effort; a cache hit above never counts).
  const today = new Date().toISOString().slice(0, 10);
  const usageRef = dbf.doc(`venuesUsage/${uid}_${today}`);
  const usageSnap = await usageRef.get();
  const used = (usageSnap.exists && usageSnap.data().count) || 0;
  if (used >= PLACES_DAILY_CAP) {
    // Serve stale cache if we have any, else fail soft with empty.
    if (cached.exists) return { places: cached.data().places || [], cached: true, capped: true };
    return { places: [], cached: false, capped: true };
  }

  const includedTypes = CATEGORY_TO_TYPES[category] || [];
  const body = {
    maxResultCount: 20,
    locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 4000 } },
  };
  if (includedTypes.length) body.includedTypes = includedTypes;

  // Places API (New) Nearby Search. Field mask is REQUIRED.
  const resp = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY.value(),
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.photos',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error('placesSearch google error', resp.status, text.slice(0, 300));
    if (cached.exists) return { places: cached.data().places || [], cached: true, stale: true };
    throw new HttpsError('unavailable', 'Places lookup failed.');
  }

  const json = await resp.json();
  const places = (json.places || []).map((p) => ({
    placeId: p.id,
    name: (p.displayName && p.displayName.text) || 'Unknown place',
    address: p.formattedAddress || '',
    lat: p.location ? p.location.latitude : lat,
    lng: p.location ? p.location.longitude : lng,
    types: p.types || [],
    rating: typeof p.rating === 'number' ? p.rating : null,
    photoRef: p.photos && p.photos[0] ? p.photos[0].name : null, // "places/XX/photos/YY"
    source: 'google',
    featured: false,
  }));

  await cacheRef.set({ places, fetchedAt: admin.firestore.FieldValue.serverTimestamp() });
  await usageRef.set(
    { count: admin.firestore.FieldValue.increment(1), day: today },
    { merge: true }
  );

  return { places, cached: false };
});
```

> IMPORTANT (leave as a code comment near the fetch): the exact `X-Goog-FieldMask` field paths for Places API (New) must be verified against ONE real response when the key exists — if a field name is wrong Google returns 400. Mirrors how `lib/gifProvider.ts` (Klipy) was written tolerant-then-verified.

- [ ] **Step 2: Add `placePhoto` callable**

```js
exports.placePhoto = onCall({ secrets: [PLACES_API_KEY] }, async (req) => {
  if (!(req.auth && req.auth.uid)) throw new HttpsError('unauthenticated', 'Sign in required.');
  const photoRef = req.data && req.data.photoRef; // "places/XX/photos/YY"
  const maxWidthPx = Math.min(Number(req.data?.maxWidthPx) || 600, 1600);
  if (typeof photoRef !== 'string' || !photoRef.startsWith('places/')) {
    throw new HttpsError('invalid-argument', 'photoRef required.');
  }
  // Places (New) photo media with skipHttpRedirect returns JSON { photoUri }.
  const url =
    `https://places.googleapis.com/v1/${photoRef}/media` +
    `?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${PLACES_API_KEY.value()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error('placePhoto error', resp.status);
    throw new HttpsError('unavailable', 'Photo fetch failed.');
  }
  const json = await resp.json();
  return { url: json.photoUri || null };
});
```

- [ ] **Step 3: Structural verification**

Run: `node --check functions/index.js`
Expected: no output (syntax OK).

Confirm Node 22 global fetch is assumed (no `node-fetch` dependency added). Grep `functions/package.json` to ensure engines/runtime is nodejs22 (it is per project history).

- [ ] **Step 4: Commit (do NOT deploy — that's a user step)**

```bash
git add functions/index.js
git commit -m "feat(places): Cloud Function proxy for Google Places (New) + Firestore cache"
```

- [ ] **Step 5: Record DEPLOY-VERIFY (for the human)**

Add a note to the task report: after the user sets the secret (`firebase functions:secrets:set PLACES_API_KEY`) and deploys (`firebase deploy --only functions`), verify one live `placesSearch` call returns places and that the `X-Goog-FieldMask` paths are correct (adjust if Google 400s). Also add a Firestore rule/consideration: `venuesCache` and `venuesUsage` are written only by the Admin SDK (Cloud Function) — ensure client rules do NOT grant write there (default-deny is fine; do not add client access).

---

## Task 3: Client network wrapper in `lib/places.ts`

**Files:**
- Modify: `lib/places.ts` (add `searchPlaces`, `placePhotoUrl`)
- Modify test: `__tests__/places.test.ts` (add mocked-callable cases)

- [ ] **Step 1: Write failing tests (mock firebase functions callable)**

Append to `__tests__/places.test.ts`:

```ts
import { searchPlaces } from '../lib/places';

// Mock the firebase functions callable layer.
const mockCallable = jest.fn();
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: () => mockCallable,
}));
jest.mock('../lib/firebase', () => ({ app: {}, functions: {} }));

describe('searchPlaces', () => {
  beforeEach(() => mockCallable.mockReset());

  it('normalizes proxy places into Place objects with mapped category', async () => {
    mockCallable.mockResolvedValue({
      data: {
        places: [
          { placeId: 'a', name: 'Villa Bar', address: '1 St', lat: 1, lng: 2, types: ['bar'], rating: 4.3, photoRef: 'places/a/photos/x', source: 'google', featured: false },
        ],
      },
    });
    const res = await searchPlaces({ lat: 1, lng: 2 }, 'Party');
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Villa Bar');
    expect(res[0].category).toBe('Party');
    expect(res[0].photoRef).toBe('places/a/photos/x');
  });

  it('returns [] when proxy returns no places', async () => {
    mockCallable.mockResolvedValue({ data: { places: [] } });
    expect(await searchPlaces({ lat: 1, lng: 2 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`searchPlaces` not exported).
Run: `npx jest __tests__/places.test.ts`

- [ ] **Step 3: Implement the wrapper in `lib/places.ts`**

Add (this file already exports the pure helpers from Task 1). Check how `lib/firebase.ts` exports the functions instance — the repo already uses `httpsCallable` (e.g. `joinPlanByCode` in `app/social.tsx`); follow that exact import pattern. Assuming `lib/firebase.ts` exports `functions`:

```ts
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface LatLng { lat: number; lng: number; }

/** Search venues near a point via the Cloud Function proxy. Maps raw proxy
 *  rows into Place objects (adds the app `category`). Never throws to the UI —
 *  returns [] on failure so the screen can show an empty state. */
export async function searchPlaces(center: LatLng, category = ''): Promise<Place[]> {
  try {
    const call = httpsCallable(functions, 'placesSearch');
    const res: any = await call({ lat: center.lat, lng: center.lng, category });
    const rows: any[] = (res?.data?.places) || [];
    return rows.map((p) => ({
      placeId: p.placeId,
      name: p.name,
      address: p.address || '',
      lat: p.lat,
      lng: p.lng,
      category: p.category || mapGoogleTypesToCategory(p.types || []),
      rating: typeof p.rating === 'number' ? p.rating : undefined,
      photoRef: p.photoRef || undefined,
      featured: !!p.featured,
      source: 'google',
    }));
  } catch (e) {
    console.warn('searchPlaces failed', e);
    return [];
  }
}

/** Resolve a Google photo resource name to a displayable URL via the proxy. */
export async function placePhotoUrl(photoRef: string, maxWidthPx = 600): Promise<string | null> {
  try {
    const call = httpsCallable(functions, 'placePhoto');
    const res: any = await call({ photoRef, maxWidthPx });
    return res?.data?.url || null;
  } catch {
    return null;
  }
}
```

> Verify `lib/firebase.ts` actually exports `functions`. If it exports it under a different name or requires `getFunctions(app)`, adapt the import to match the existing pattern used by `joinPlanByCode`/`checkUsername` callers. If the mock in the test needs a matching shape, adjust the `jest.mock('../lib/firebase', ...)` accordingly.

- [ ] **Step 4: Run — expect PASS.** `npx jest __tests__/places.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/places.ts __tests__/places.test.ts
git commit -m "feat(places): client proxy wrapper (searchPlaces, placePhotoUrl)"
```

---

## Task 4: `PlaceCard` and `TitlePopup` components

**Files:**
- Create: `components/places/PlaceCard.tsx`
- Create: `components/places/TitlePopup.tsx`
- Create test: `__tests__/ui/TitlePopup.test.tsx`

- [ ] **Step 1: Write the failing test for TitlePopup**

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TitlePopup from '../../components/places/TitlePopup';

// ThemeProvider is globally available via jest.setup mock pattern used by other
// UI tests; follow the same wrapper those tests use (see __tests__/ui/*).
describe('TitlePopup', () => {
  it('preselects the time-appropriate title and confirms the chosen one', () => {
    const onConfirm = jest.fn();
    const when = new Date(2026, 0, 1, 21, 0); // Night
    const { getByText } = render(
      <TitlePopup visible venueName="Villa Bar" when={when} onConfirm={onConfirm} onClose={() => {}} />
    );
    // All four chips render.
    getByText('Night at Villa Bar');
    getByText('Morning at Villa Bar');
    // Confirm proceeds with the (preselected) Night title.
    fireEvent.press(getByText('Start planning'));
    expect(onConfirm).toHaveBeenCalledWith('Night at Villa Bar');
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx jest __tests__/ui/TitlePopup.test.tsx`
  (First check an existing `__tests__/ui/*.test.tsx` to copy the exact ThemeProvider render wrapper this repo uses; mirror it here so the component gets a theme.)

- [ ] **Step 3: Implement `TitlePopup.tsx`**

A `Modal` (monochrome, no emoji). Props:
```ts
interface Props {
  visible: boolean;
  venueName: string;
  when: Date;              // event time if known, else current time
  onConfirm: (title: string) => void;
  onClose: () => void;
}
```
Behavior: build the four titles from `TIME_TITLE_PARTS.map(part => \`${part} at ${venueName}\`)`. Track `selected` state, initialized to `titleForTime(venueName, when)`. Render four selectable chips (selected one has a filled/bordered style via `Colors`) + a `TextInput` seeded with `selected` for a custom title (editing the field updates `selected`). A primary "Start planning" button calls `onConfirm(selected.trim() || venueName)`. Use `useThemedStyles(makeStyles)`/`useTheme()`. Import helpers from `lib/places`.

- [ ] **Step 4: Implement `PlaceCard.tsx`**

Props:
```ts
interface Props {
  place: Place;
  distanceKm?: number | null;
  variant?: 'list' | 'carousel'; // list = full-width row; carousel = compact fixed-width
  onPress: (place: Place) => void;
}
```
Renders the venue photo (resolve via `placePhotoUrl(place.photoRef)` in a `useEffect` → local state URL; show a category-icon placeholder `View` while null or if no photoRef — use an Ionicon that matches `place.category`, greyscale), the name, category, rating (if any), distance (if provided, reuse the `formatDistance` style already in discover — a simple `${km.toFixed(1)} km` is fine), and a **"Featured" ribbon slot** that renders only when `place.featured` (always false in Plan A, but the code path exists). `carousel` variant is a fixed width (~160) card for horizontal lists; `list` variant is a full-width row. Monochrome, no emoji, `expo-image` for the photo (already a dependency — the repo uses it in `components/Avatar.tsx`).

- [ ] **Step 5: Run tests — expect PASS.** `npx jest __tests__/ui/TitlePopup.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add components/places/PlaceCard.tsx components/places/TitlePopup.tsx __tests__/ui/TitlePopup.test.tsx
git commit -m "feat(places): PlaceCard + time-aware TitlePopup components"
```

---

## Task 5: The dedicated Places tab (list) + tab registration

**Files:**
- Create: `app/(tabs)/places.tsx`
- Modify: `app/(tabs)/_layout.tsx` (add the 5th tab)

- [ ] **Step 1: Register the tab in `_layout.tsx`**

Add to the `TABS` array (insert Places after Discover):
```ts
{ name: 'places', label: 'Places', icon: 'location-outline' as const, iconActive: 'location' as const },
```
Add the screen inside `<Tabs>`:
```tsx
<Tabs.Screen name="places" />
```
Fix the custom bar's split so 5 tabs render sensibly around the center create button. With 5 tabs, render the **first two on the left** and the **last three on the right** (the bar already does `TABS.slice(0,2)` / `TABS.slice(2)` — with 5 entries that yields 2 left + 3 right automatically, which is acceptable). Verify visually that spacing still looks balanced; if it's too tight, reduce `iconWrap` width slightly — but do not change the monochrome styling.

- [ ] **Step 2: Implement `app/(tabs)/places.tsx` (list only — no map in Plan A)**

Structure (follow discover.tsx patterns for location + theming):
- On mount, get the user's location via `expo-location` (same permission flow discover uses); fall back to a default city centroid if denied (use a sensible default from `lib/cities.ts`, e.g. the user's stored city if available, else first city).
- State: `center: LatLng`, `category: string`, `places: Place[]`, `loading`.
- Fetch: `searchPlaces(center, category)` on mount and whenever `category` changes.
- Render: a category filter pill row (reuse `components/CategoryPill`/`CategoryPillRow` which discover already uses — pass the app CATEGORIES), then a `FlatList` of `<PlaceCard variant="list" .../>`.
- On card press: open `<TitlePopup visible venueName={place.name} when={new Date()} onConfirm={(title) => goToCreatePlan(place, title)} .../>`.
- `goToCreatePlan(place, title)`: `router.push({ pathname: '/create-plan', params: { title, placeJson: JSON.stringify({ placeId, name, address, lat, lng, photoRef: photoRef ?? '', category, source: 'google', featured: false }) } })`.
- Empty/error state: friendly "No places found here yet" (monochrome), plus the existing manual create flow is always available via the center + button.

- [ ] **Step 3: Verify types + suite**

Run: `npx tsc --noEmit && npx jest`
Expected: clean + green. (No new unit test is required for the screen itself beyond tsc; the fetch layer is already tested. If you can add a light render test mirroring existing screen tests, do so, but don't force one.)

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/places.tsx" "app/(tabs)/_layout.tsx"
git commit -m "feat(places): dedicated Places tab with venue list + category filter"
```

---

## Task 6: create-plan seeding — accept `place`/`title`, event-time title, persist `place`

**Files:**
- Modify: `app/create-plan.tsx`

- [ ] **Step 1: Read the incoming params**

Add `useLocalSearchParams` to the expo-router import and parse at the top of the component:
```ts
import { useLocalSearchParams, useRouter } from 'expo-router';
// ...
const params = useLocalSearchParams<{ title?: string; placeJson?: string }>();
const seededPlace = useMemo(() => {
  try { return params.placeJson ? JSON.parse(params.placeJson) : null; } catch { return null; }
}, [params.placeJson]);
```

- [ ] **Step 2: Seed the form on mount (reuse the applyTemplate pattern)**

In a `useEffect` that runs once when `seededPlace` first appears, prefill:
- `setTitle(params.title || '')`
- `setLocation(\`${seededPlace.name}${seededPlace.address ? ', ' + seededPlace.address : ''}\`)`
- if `seededPlace.category`, `setCategory(seededPlace.category)` (+ `setUsingCustomCategory(!(CATEGORIES as readonly string[]).includes(seededPlace.category))`)
- keep lat/lng from the place for submit (see Step 4).
Guard so this only runs once and never clobbers user edits (use a ref `seededRef`).

- [ ] **Step 3: Re-derive the title from the EVENT time unless user-edited**

The plan title should follow the event time the user picks (user decision). Track whether the user has manually edited the title:
- Add `const titleEditedRef = useRef(false);` and in the title `TextInput.onChangeText`, set `titleEditedRef.current = true` before `setTitle`.
- When `seededPlace` exists and the user changes the date or time (the existing `date`/`time` state), recompute: if `!titleEditedRef.current`, `setTitle(titleForTime(seededPlace.name, combinedEventDate))` where `combinedEventDate` is a Date built from the selected `date` + `time` (same combination used to build `dateTimestamp` at line ~197). Do this in a `useEffect` keyed on `[date, time, seededPlace]`.
- Import `titleForTime` from `lib/places`.

This yields: pick a place → popup gives "Night at X" (current time) → on the create screen, once they set the event date/time, the title updates to match the event's time-of-day, unless they typed their own.

- [ ] **Step 4: Persist the `place` on submit + use its coords**

In the `setDoc` call (currently line ~207-227), add:
```ts
place: seededPlace
  ? {
      placeId: seededPlace.placeId,
      name: seededPlace.name,
      address: seededPlace.address || '',
      lat: seededPlace.lat,
      lng: seededPlace.lng,
      photoRef: seededPlace.photoRef || null,
      source: 'google',
      featured: false,
    }
  : null,
```
And when `seededPlace` is present, use its `lat`/`lng` directly for the existing `lat`/`lng` fields instead of geocoding (skip the geocode call when `seededPlace` exists — it already has coordinates). Keep the free-text geocode path unchanged for non-seeded plans.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: clean + green. Manually reason through: seeded plan saves with a `place` object + correct coords; a normal (non-seeded) plan is completely unchanged (params absent → `seededPlace` null → every new branch is a no-op).

- [ ] **Step 6: Commit**

```bash
git add app/create-plan.tsx
git commit -m "feat(places): seed create-plan from a venue with event-time-aware title"
```

---

## Task 7: Discover integration — Places carousel + Location switcher

**Files:**
- Create: `components/places/PlacesCarousel.tsx`
- Create: `components/places/LocationSwitcher.tsx`
- Modify: `app/(tabs)/discover.tsx` (mount both in the existing `ListHeaderComponent`; drive both the carousel and the public-quorums query off the chosen location)

- [ ] **Step 1: Implement `LocationSwitcher.tsx`**

A header control showing the current city label with a chevron; tapping opens a picker Modal backed by `lib/cities.ts` (list the user's country's cities; the country/city the user already has on their profile is a good default) plus a "Use my location" row that re-requests GPS. Props:
```ts
interface Props {
  label: string;                       // e.g. "Cape Town"
  onPick: (center: LatLng, label: string) => void;   // city centroid or GPS
  onUseMyLocation: () => void;
}
```
For city centroids: `lib/cities.ts` is a name list, not coords. Geocode the chosen city name to a centroid with `expo-location`'s `geocodeAsync` (the app already uses it in create-plan) and pass that as `center`. Monochrome, no emoji, Ionicons chevron.

- [ ] **Step 2: Implement `PlacesCarousel.tsx`**

Horizontal `FlatList` (`horizontal`, `showsHorizontalScrollIndicator={false}`) of `<PlaceCard variant="carousel" .../>`, plus a trailing "See all" card that `router.push('/places')`. Props:
```ts
interface Props {
  center: LatLng;
  onPickVenue: (place: Place) => void;  // opens TitlePopup (owned by discover)
}
```
Fetches `searchPlaces(center)` (no category filter) on `center` change; shows a skeleton row while loading, and renders nothing (or a slim "No places nearby" line) if empty. This is horizontal-only, so it nests safely inside Discover's vertical FlatList header.

- [ ] **Step 3: Wire into `discover.tsx`**

- Add Discover-local state: `center: LatLng | null`, `cityLabel: string`, and (reuse existing) `userCoords`. Initialize `center` from the user's GPS (existing flow) or their profile city.
- Extend the existing `listHeader` (`ListHeaderComponent`) to render, above the current header content: `<LocationSwitcher label={cityLabel} onPick={...} onUseMyLocation={...} />`, then a "Places near you" section heading, then `<PlacesCarousel center={center} onPickVenue={openTitlePopup} />`, then the existing "Public quorums near you" content.
- `openTitlePopup(place)`: set state to show a `<TitlePopup>` (same component as the Places tab) → onConfirm navigates to create-plan with the same params shape as Task 5 Step 2.
- **Drive the public-quorums query off `center`:** the existing distance sort uses `userCoords`; make it use the switcher's `center` instead so changing the city re-centers BOTH the carousel and the public-quorums distance/sort. If the public feed currently filters by GPS proximity, switch that to `center`. (If public quorums are loaded globally and only sorted by distance, just re-sort by `center` — keep it simple; don't add server-side geo queries in Plan A.)
- Keep the existing feed content otherwise unchanged.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: clean + green. Reason through: carousel is horizontal (no nested-vertical-scroll conflict); changing the location switcher updates `center` → carousel refetches and the public feed re-centers; default behavior (GPS) matches today.

- [ ] **Step 5: Commit**

```bash
git add components/places/PlacesCarousel.tsx components/places/LocationSwitcher.tsx "app/(tabs)/discover.tsx"
git commit -m "feat(places): Discover places carousel + location switcher"
```

---

## Task 8: Featured-venue data hook (ribbon slot, always off)

**Files:**
- Verify only (no new work if Tasks 2–4 already carried `featured` through): `functions/index.js` sets `featured: false`; `Place.featured` exists; `PlaceCard` renders a ribbon when `place.featured`.

- [ ] **Step 1: Confirm the seam exists end-to-end**

Grep to confirm `featured` flows: proxy returns it, `searchPlaces` maps it, `PlaceCard` conditionally renders a "Featured" ribbon (greyscale, no emoji) only when true. Add a one-line comment in `functions/index.js` at the normalization marking where a future sponsored-injection step (Feature B) will set `featured: true` for paid venues.

- [ ] **Step 2: Commit (if any change)**

```bash
git add -A
git commit -m "chore(places): document featured-venue injection seam (Feature B hook)"
```

---

## Task 9: Full verification

- [ ] **Step 1: Automated gate**

Run: `npx tsc --noEmit && npx jest && node --check functions/index.js`
Expected: tsc clean; jest green (includes the new `places.test.ts` + `TitlePopup.test.tsx`); functions syntax OK.

- [ ] **Step 2: Record the live DEPLOY-VERIFY checklist (user-owned)**

These need the user's Google setup + a build; document them in the report, do not attempt here:
1. Enable **Places API (New)** on `quorum-323e1`; create a server key; `firebase functions:secrets:set PLACES_API_KEY`.
2. `firebase deploy --only functions` (adds `placesSearch`, `placePhoto`).
3. In Expo Go (Plan A needs no native modules): open the **Places tab** → venues load with photos → tap one → TitlePopup → create-plan seeded → set a date/time → title updates to match the event time → save → plan opens with the venue as its location. Then open **Discover** → carousel shows places → change the **location switcher** city → carousel + public feed re-center.
4. If Google returns 400, fix the `X-Goog-FieldMask` paths (Task 2) and redeploy.

---

## Deferred to Plan B (the map — separate plan, needs native + dev build)

- Install `react-native-maps`; add the Android Google **Maps SDK** key (package `quorums.co.za` + the upload + Play-signing SHA-1s) to native config via the config plugin.
- `components/places/PlacesMap.tsx` — custom greyscale map style, venue pins from `searchPlaces`, tap pin → preview card → same TitlePopup → auto-quorum.
- Add a **list ⇄ map toggle** to the Places tab.
- Requires an **EAS dev build** (won't run in Expo Go) — `eas build --profile development` + install on device.
- Plan B is written after Plan A is merged/tested.
