# Pro Profile Customization — Plan 2: Tenor animated pfp + banner

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let Pro users pick an animated GIF avatar and an animated profile banner from a SFW Tenor picker; render them (animated on profile screens, still elsewhere) and Pro-gate the picker.

**Architecture:** A thin `lib/tenor.ts` client (always SFW `contentfilter=high`) returns `{id, gifUrl, stillUrl, dims}` items. A reusable `<GifPicker>` modal presents trending + search results and returns a chosen item. A `<ProfileBanner>` renders the banner image (animated/still) or nothing. `profile.tsx` wires avatar-GIF picking + banner editing + writes the four new user-doc fields, Pro-gating both behind the existing `<PaywallModal>`; `user-profile.tsx` renders the same GIF avatar + banner read-only. The shared `<Avatar>` from Plan 1 already selects gif-vs-still — this plan just feeds it the new fields.

**Tech Stack:** React Native + Expo SDK 55, TypeScript, `expo-image`, Firestore, Jest (`jest-expo`) + `@testing-library/react-native`. Tenor v2 API.

**Spec:** `docs/superpowers/specs/2026-09-01-pro-profile-customization-design.md`
**Builds on:** Plan 1 (branch `feature/pro-profile-customization`) — `lib/profileCustomization.ts`, `components/Avatar.tsx`.

## Key facts (verified in the codebase)

- **Paywall pattern:** `components/PaywallModal.tsx` default export takes `{ visible: boolean; onClose: () => void; reason?: string }`. Usage: local `const [showPaywall, setShowPaywall] = useState(false)` + `<PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} reason="…" />`.
- **Pro flag:** `import { useSubscription } from '../../hooks/useSubscription'` → `const { isPro } = useSubscription()`.
- **Existing avatar upload** lives in `handleAvatarPick` (`profile.tsx` ~322–352): permission → `ImagePicker.launchImageLibraryAsync` → upload to Storage `avatars/${uid}` → `updateDoc(users/{uid}, { avatarUrl })` → `setProfile`.
- **`<Avatar>` props:** `name, uploadUrl, gifUrl, stillUrl, decorationId, animated, imageStyle, fallbackStyle, initialStyle, testID`. On profile screens it is rendered with `animated`.
- **No real Tenor key is needed to build/test this plan** — tests mock `fetch`/the tenor module. At runtime the picker reads `process.env.EXPO_PUBLIC_TENOR_KEY`; until it is set, the picker shows its empty/error state.

## File Structure

- **Create** `lib/tenor.ts` — Tenor v2 client (SFW). One responsibility: fetch + normalize GIFs.
- **Create** `components/GifPicker.tsx` — modal picker (trending + search). One responsibility: choose a GIF.
- **Create** `components/ProfileBanner.tsx` — render a banner image or nothing.
- **Create** tests: `__tests__/tenor.test.ts`, `__tests__/ui/GifPicker.test.tsx`, `__tests__/ui/ProfileBanner.test.tsx`.
- **Modify** `app/(tabs)/profile.tsx` — new fields on type; feed Avatar; render banner; GIF-pick + banner-edit flows + Pro-gate.
- **Modify** `app/user-profile.tsx` — feed Avatar the gif/still; render banner (read-only).

---

### Task 1: `lib/tenor.ts` — SFW Tenor client

**Files:** Create `lib/tenor.ts`; Test `__tests__/tenor.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/tenor.test.ts
import { searchGifs, trendingGifs, __parseTenor } from '../lib/tenor';

const sampleResponse = {
  results: [
    {
      id: '1',
      media_formats: {
        tinygif: { url: 'https://t/1.gif', dims: [220, 180] },
        tinygifpreview: { url: 'https://t/1.png', dims: [220, 180] },
      },
    },
    {
      id: '2',
      media_formats: {
        tinygif: { url: 'https://t/2.gif', dims: [200, 200] },
        tinygifpreview: { url: 'https://t/2.png', dims: [200, 200] },
      },
    },
  ],
};

describe('__parseTenor', () => {
  it('maps results to {id, gifUrl, stillUrl, dims}', () => {
    expect(__parseTenor(sampleResponse)).toEqual([
      { id: '1', gifUrl: 'https://t/1.gif', stillUrl: 'https://t/1.png', dims: [220, 180] },
      { id: '2', gifUrl: 'https://t/2.gif', stillUrl: 'https://t/2.png', dims: [200, 200] },
    ]);
  });

  it('skips results missing a tinygif url', () => {
    expect(__parseTenor({ results: [{ id: 'x', media_formats: {} }] })).toEqual([]);
  });

  it('tolerates a missing results array', () => {
    expect(__parseTenor({})).toEqual([]);
  });
});

describe('searchGifs / trendingGifs', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('search always requests SFW content and passes the query', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleResponse,
    });
    global.fetch = fetchMock as any;

    const out = await searchGifs('cat', 10);

    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/search');
    expect(calledUrl).toContain('contentfilter=high');
    expect(calledUrl).toContain('q=cat');
    expect(calledUrl).toContain('limit=10');
    expect(out).toHaveLength(2);
    expect(out[0].gifUrl).toBe('https://t/1.gif');
  });

  it('trending always requests SFW content', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleResponse,
    });
    global.fetch = fetchMock as any;

    await trendingGifs(12);

    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/featured');
    expect(calledUrl).toContain('contentfilter=high');
    expect(calledUrl).toContain('limit=12');
  });

  it('returns [] when the request is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as any;
    expect(await searchGifs('cat')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx jest __tests__/tenor.test.ts` → `Cannot find module '../lib/tenor'`.

- [ ] **Step 3: Implement**

```ts
// lib/tenor.ts
// Minimal Tenor v2 client. SFW is NON-NEGOTIABLE: every request sends
// contentfilter=high so the provider only returns G-rated content.

export type TenorResult = {
  id: string;
  gifUrl: string;   // animated (tinygif)
  stillUrl: string; // static preview (tinygifpreview) — used in list/non-animated surfaces
  dims: [number, number];
};

const BASE = 'https://tenor.googleapis.com/v2';
const KEY = process.env.EXPO_PUBLIC_TENOR_KEY ?? '';

function buildUrl(path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams({
    key: KEY,
    contentfilter: 'high', // SFW gate — never remove
    media_filter: 'tinygif,tinygifpreview',
    ...params,
  });
  return `${BASE}${path}?${qs.toString()}`;
}

/** Exported for tests. Normalizes a Tenor response to TenorResult[]. */
export function __parseTenor(json: any): TenorResult[] {
  const results = Array.isArray(json?.results) ? json.results : [];
  const out: TenorResult[] = [];
  for (const r of results) {
    const gif = r?.media_formats?.tinygif;
    const still = r?.media_formats?.tinygifpreview;
    if (!gif?.url) continue;
    out.push({
      id: String(r.id ?? gif.url),
      gifUrl: gif.url,
      stillUrl: still?.url ?? gif.url,
      dims: Array.isArray(gif.dims) ? [gif.dims[0], gif.dims[1]] : [1, 1],
    });
  }
  return out;
}

async function fetchTenor(url: string): Promise<TenorResult[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return __parseTenor(await res.json());
  } catch {
    return [];
  }
}

export function searchGifs(query: string, limit = 24): Promise<TenorResult[]> {
  return fetchTenor(buildUrl('/search', { q: query, limit: String(limit) }));
}

export function trendingGifs(limit = 24): Promise<TenorResult[]> {
  return fetchTenor(buildUrl('/featured', { limit: String(limit) }));
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx jest __tests__/tenor.test.ts` (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tenor.ts __tests__/tenor.test.ts
git commit -m "feat(tenor): add SFW Tenor v2 client (search/trending)"
```

---

### Task 2: `components/GifPicker.tsx` — SFW picker modal

**Files:** Create `components/GifPicker.tsx`; Test `__tests__/ui/GifPicker.test.tsx`.

**Design:** A `<Modal>` that loads `trendingGifs()` on open, searches via `searchGifs(query)` (debounced by a submit/So-simple: search on submit), lays results in a 3-column grid of tappable stills, and calls `onSelect(result)` then `onClose()`. Empty/error state shows a message. Uses `expo-image` for thumbnails (still frame).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/ui/GifPicker.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import GifPicker from '../../components/GifPicker';
import * as tenor from '../../lib/tenor';

jest.mock('../../lib/tenor');

const fixtures = [
  { id: '1', gifUrl: 'https://t/1.gif', stillUrl: 'https://t/1.png', dims: [200, 200] as [number, number] },
  { id: '2', gifUrl: 'https://t/2.gif', stillUrl: 'https://t/2.png', dims: [200, 200] as [number, number] },
];

describe('GifPicker', () => {
  beforeEach(() => {
    (tenor.trendingGifs as jest.Mock).mockResolvedValue(fixtures);
    (tenor.searchGifs as jest.Mock).mockResolvedValue([fixtures[1]]);
  });

  it('loads trending on open and renders results', async () => {
    render(<GifPicker visible onSelect={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('gif-result-1')).toBeOnTheScreen());
    expect(screen.getByTestId('gif-result-2')).toBeOnTheScreen();
    expect(tenor.trendingGifs).toHaveBeenCalled();
  });

  it('does not fetch when not visible', () => {
    render(<GifPicker visible={false} onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(tenor.trendingGifs).not.toHaveBeenCalled();
  });

  it('calls onSelect with the chosen result then closes', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    render(<GifPicker visible onSelect={onSelect} onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('gif-result-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('gif-result-1'));
    expect(onSelect).toHaveBeenCalledWith(fixtures[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('searches on submit', async () => {
    render(<GifPicker visible onSelect={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('gif-result-1')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('gif-search-input'), 'party');
    fireEvent(screen.getByTestId('gif-search-input'), 'submitEditing');
    await waitFor(() => expect(tenor.searchGifs).toHaveBeenCalledWith('party', expect.any(Number)));
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx jest __tests__/ui/GifPicker.test.tsx`.

- [ ] **Step 3: Implement**

```tsx
// components/GifPicker.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';
import { searchGifs, trendingGifs, TenorResult } from '../lib/tenor';

type Props = {
  visible: boolean;
  onSelect: (result: TenorResult) => void;
  onClose: () => void;
};

const NUM_COLUMNS = 3;
const PAGE_SIZE = 24;

export default function GifPicker({ visible, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TenorResult[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const data = q.trim() ? await searchGifs(q.trim(), PAGE_SIZE) : await trendingGifs(PAGE_SIZE);
    setResults(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    load('');
  }, [visible, load]);

  const handlePick = useCallback(
    (item: TenorResult) => {
      onSelect(item);
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Pick a GIF</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close GIF picker" hitSlop={8}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <TextInput
            testID="gif-search-input"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => load(query)}
            placeholder="Search GIFs"
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            style={styles.search}
          />

          {loading ? (
            <ActivityIndicator style={styles.loader} color={Colors.textPrimary} />
          ) : results.length === 0 ? (
            <Text style={styles.empty}>No GIFs found. Try another search.</Text>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              numColumns={NUM_COLUMNS}
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`gif-result-${item.id}`}
                  style={styles.cell}
                  onPress={() => handlePick(item)}
                  accessibilityLabel="Select GIF"
                >
                  <Image source={{ uri: item.stillUrl }} style={styles.thumb} contentFit="cover" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    height: '75%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  title: { fontSize: FontSize.lg, color: Colors.textPrimary, fontWeight: '700' },
  search: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  loader: { marginTop: Spacing.xl },
  empty: { color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xl },
  grid: { paddingBottom: Spacing.xl },
  cell: { flex: 1 / NUM_COLUMNS, aspectRatio: 1, margin: 2, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Colors.surface },
  thumb: { width: '100%', height: '100%' },
});
```

- [ ] **Step 4: Run it, expect PASS**, then `npx tsc --noEmit`. If any imported theme token (`Colors.surface`, `Colors.textMuted`, `FontSize.lg`, `Radius.sm/md/lg`, `Spacing.*`) does not exist in `lib/theme`, open `lib/theme.ts`, pick the closest existing token, and use it (do not invent tokens). Note any substitution in your report.

- [ ] **Step 5: Commit**

```bash
git add components/GifPicker.tsx __tests__/ui/GifPicker.test.tsx
git commit -m "feat(profile): add SFW GifPicker modal (Tenor-backed)"
```

---

### Task 3: `components/ProfileBanner.tsx` — banner renderer

**Files:** Create `components/ProfileBanner.tsx`; Test `__tests__/ui/ProfileBanner.test.tsx`.

**Design:** Renders the banner image (gif animated when `animated`, else still) filling a fixed-height header; renders `null` when no banner is set (so free/no-banner profiles keep today's layout).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/ui/ProfileBanner.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ProfileBanner from '../../components/ProfileBanner';

describe('ProfileBanner', () => {
  it('renders nothing when no banner is set', () => {
    render(<ProfileBanner testID="banner" />);
    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('renders the still when not animated', () => {
    render(<ProfileBanner testID="banner" gifUrl="https://b/1.gif" stillUrl="https://b/1.png" />);
    const img = screen.getByTestId('banner');
    const src = img.props.source;
    expect((Array.isArray(src) ? src[0] : src)).toEqual({ uri: 'https://b/1.png' });
    expect(img.props.autoplay).toBe(false);
  });

  it('plays the gif when animated', () => {
    render(<ProfileBanner testID="banner" gifUrl="https://b/1.gif" stillUrl="https://b/1.png" animated />);
    const img = screen.getByTestId('banner');
    const src = img.props.source;
    expect((Array.isArray(src) ? src[0] : src)).toEqual({ uri: 'https://b/1.gif' });
    expect(img.props.autoplay).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement**

```tsx
// components/ProfileBanner.tsx
import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Image, ImageStyle } from 'expo-image';

type Props = {
  gifUrl?: string;
  stillUrl?: string;
  /** True only on the full profile screens, where the banner animates. */
  animated?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const DEFAULT_HEIGHT = 150;

export default function ProfileBanner({ gifUrl, stillUrl, animated = false, height = DEFAULT_HEIGHT, style, testID }: Props) {
  const uri = animated ? gifUrl ?? stillUrl : stillUrl ?? gifUrl;
  if (!uri) return null;
  return (
    <Image
      testID={testID ?? 'profile-banner'}
      source={{ uri }}
      style={[{ width: '100%', height }, style as StyleProp<ImageStyle>]}
      contentFit="cover"
      autoplay={animated && !!gifUrl}
      accessibilityIgnoresInvertColors
    />
  );
}
```

- [ ] **Step 4: Run it, expect PASS** (3 tests), then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add components/ProfileBanner.tsx __tests__/ui/ProfileBanner.test.tsx
git commit -m "feat(profile): add ProfileBanner renderer (animated on profile)"
```

---

### Task 4: Wire animated pfp + banner into `app/(tabs)/profile.tsx` (own profile, editable)

**Files:** Modify `app/(tabs)/profile.tsx`.

This is an integration task — READ the relevant regions first (type ~29–43; `handleAvatarPick` ~322–352; hero/avatar JSX ~461–500; the `<Avatar>` added in Plan 1 ~475). Follow the existing patterns.

- [ ] **Step 1: Add imports**

```tsx
import GifPicker from '../../components/GifPicker';
import ProfileBanner from '../../components/ProfileBanner';
import PaywallModal from '../../components/PaywallModal';
import { useSubscription } from '../../hooks/useSubscription';
import { TenorResult } from '../../lib/tenor';
```

- [ ] **Step 2: Extend the `UserProfile` type** (add to the existing `type UserProfile = { … }` near line 29):

```tsx
  avatarGifUrl?: string;
  avatarStillUrl?: string;
  bannerGifUrl?: string;
  bannerStillUrl?: string;
```

- [ ] **Step 3: Add state + Pro flag** (near the other `useState`/hook calls in the component body):

```tsx
  const { isPro } = useSubscription();
  const [showPaywall, setShowPaywall] = useState(false);
  const [gifTarget, setGifTarget] = useState<null | 'avatar' | 'banner'>(null);
```

- [ ] **Step 4: Add handlers** (near `handleAvatarPick`):

```tsx
  // Free users get the existing upload path; Pro users choose upload vs animated GIF.
  const onAvatarPress = useCallback(() => {
    if (uploadingAvatar) return;
    if (!isPro) {
      handleAvatarPick();
      return;
    }
    Alert.alert('Change avatar', undefined, [
      { text: 'Upload photo', onPress: () => handleAvatarPick() },
      { text: 'Pick a GIF', onPress: () => setGifTarget('avatar') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [isPro, uploadingAvatar, handleAvatarPick]);

  const onEditBanner = useCallback(() => {
    if (!isPro) {
      setShowPaywall(true);
      return;
    }
    setGifTarget('banner');
  }, [isPro]);

  const onGifSelected = useCallback(
    async (result: TenorResult) => {
      if (!uid || !gifTarget) return;
      const fields =
        gifTarget === 'avatar'
          ? { avatarGifUrl: result.gifUrl, avatarStillUrl: result.stillUrl }
          : { bannerGifUrl: result.gifUrl, bannerStillUrl: result.stillUrl };
      try {
        await updateDoc(doc(db, 'users', uid), fields);
        setProfile((p) => (p ? { ...p, ...fields } : p));
        showToast(gifTarget === 'avatar' ? 'Avatar updated!' : 'Banner updated!');
      } catch {
        showToast('Failed to update', 'error');
      } finally {
        setGifTarget(null);
      }
    },
    [uid, gifTarget, showToast]
  );
```

(`Alert` must be imported from `react-native` — add it to the existing `react-native` import list if missing.)

- [ ] **Step 5: Feed the Avatar the gif/still + swap the avatar press handler.** In the hero, the Plan-1 `<Avatar testID="profile-avatar" … />` currently receives `name`/`uploadUrl`. Add:

```tsx
                gifUrl={profile?.avatarGifUrl}
                stillUrl={profile?.avatarStillUrl}
```

And change the enclosing avatar `TouchableOpacity`'s `onPress={handleAvatarPick}` to `onPress={onAvatarPress}`.

- [ ] **Step 6: Render the banner + an edit affordance.** Immediately inside the hero container (`{/* ── Hero Banner ── */}` block, before the avatar `TouchableOpacity`), add:

```tsx
          <ProfileBanner
            gifUrl={profile?.bannerGifUrl}
            stillUrl={profile?.bannerStillUrl}
            animated
          />
          <TouchableOpacity
            onPress={onEditBanner}
            style={styles.bannerEditButton}
            accessibilityLabel="Edit banner"
            hitSlop={8}
          >
            <Ionicons name="image-outline" size={16} color={Colors.background} />
          </TouchableOpacity>
```

Add these styles to the `StyleSheet.create({…})` block:

```tsx
  bannerEditButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.pill ?? 999,
    padding: Spacing.xs,
    zIndex: 2,
  },
```

(If `Radius.pill` doesn't exist, use `999`. Verify `Spacing.xs` exists; if not use `6`.)

- [ ] **Step 7: Render the picker + paywall** near the end of the returned JSX (alongside other modals):

```tsx
      <GifPicker
        visible={gifTarget !== null}
        onSelect={onGifSelected}
        onClose={() => setGifTarget(null)}
      />
      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason="Upgrade to Pro for animated avatars and custom banners."
      />
```

- [ ] **Step 8: Verify** — `npx tsc --noEmit` (clean) and `npx jest` (full suite still green). If the hero layout makes the banner/avatar overlap wrong, adjust only the local hero styles to place the avatar over the banner (Discord-style) — describe any layout change in your report. Behavior for FREE users must be unchanged (upload-only avatar, no banner, tapping banner-edit → paywall).

- [ ] **Step 9: Commit**

```bash
git add "app/(tabs)/profile.tsx"
git commit -m "feat(profile): animated GIF avatar + custom banner (Pro-gated) on own profile"
```

---

### Task 5: Render animated pfp + banner in `app/user-profile.tsx` (read-only)

**Files:** Modify `app/user-profile.tsx`.

READ the `Profile` type (~40–46), the profile-doc load, and the Plan-1 `<Avatar testID="user-avatar" …>` (~306–317) first.

- [ ] **Step 1: Add imports**

```tsx
import ProfileBanner from '../components/ProfileBanner';
```

- [ ] **Step 2: Extend the `Profile` type** (add the four optional fields):

```tsx
  avatarGifUrl?: string;
  avatarStillUrl?: string;
  bannerGifUrl?: string;
  bannerStillUrl?: string;
```

- [ ] **Step 3: Feed the Avatar the gif/still.** On the existing `<Avatar testID="user-avatar" … animated … />`, add:

```tsx
            gifUrl={profile.avatarGifUrl}
            stillUrl={profile.avatarStillUrl}
```

- [ ] **Step 4: Render the banner** just inside the avatar/identity header (before the `avatarCircle`), so another user's banner shows above their avatar:

```tsx
        <ProfileBanner
          gifUrl={profile.bannerGifUrl}
          stillUrl={profile.bannerStillUrl}
          animated
        />
```

(Place it so it sits behind/above the avatar consistent with the header layout; adjust only local layout styles if needed and note it.)

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npx jest` full suite green.

- [ ] **Step 6: Commit**

```bash
git add app/user-profile.tsx
git commit -m "feat(profile): show other users' animated avatar + banner"
```

---

### Task 6: Regression + manual-verify note

- [ ] **Step 1:** `npx jest` → all green (expect prior 82 + 7 tenor + 4 GifPicker + 3 ProfileBanner = 96).
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Record manual on-device checks for the reviewer/human (cannot run headless): (a) as a Pro test account, avatar tap offers Upload/Pick-a-GIF; picking a GIF animates on your profile and shows a still in lists; (b) banner edit sets an animated banner on your profile and it renders on your public profile for others; (c) as a FREE account, avatar tap goes straight to upload and banner-edit opens the paywall; (d) with no `EXPO_PUBLIC_TENOR_KEY`, the picker shows its empty state without crashing.
- [ ] **Step 4:** Commit any fixes from Steps 1–2 if needed.

---

## Self-Review

- **Spec coverage:** animated Tenor pfp ✅ (Tasks 1,2,4,5); animated banner ✅ (Tasks 3,4,5); SFW-only via `contentfilter=high` ✅ (Task 1, asserted in tests); animate-on-profile-only ✅ (Avatar/ProfileBanner `animated` prop, passed only on profile screens; lists still use the Plan-1 static `<Avatar>`); Pro-gate ✅ (Task 4 — free → upload/paywall); four user-doc fields, no migration ✅ (optional). Decorations, bio/tagline/colors, and the unified preview editor + Firestore Pro-gate rule are later plans — not gaps.
- **Placeholder scan:** none; the two "if a token/field name differs, use the closest existing one" notes (Tasks 2,4) are guardrails, each shipping concrete code.
- **Type consistency:** `TenorResult {id,gifUrl,stillUrl,dims}` defined in Task 1 and consumed unchanged in Tasks 2,4; `<GifPicker>` props `{visible,onSelect,onClose}` consistent Tasks 2/4; `<ProfileBanner>` props `{gifUrl,stillUrl,animated,height,style,testID}` consistent Tasks 3/4/5; user-doc fields `avatarGifUrl/avatarStillUrl/bannerGifUrl/bannerStillUrl` identical across Tasks 4/5 and match Plan 1's `ProfileCustomization`.
