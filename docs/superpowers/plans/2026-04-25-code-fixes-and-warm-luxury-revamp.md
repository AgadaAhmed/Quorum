# Code Fixes + Warm Luxury Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four render/subscription bugs, then execute the full Warm Luxury visual overhaul (rose→amber palette, new PlanCard component, category gradient banners).

**Architecture:** All color changes flow through `lib/theme.ts` token swap — most screens inherit automatically. Explicit edits needed only where rose values are hardcoded. New `PlanCard` component replaces `GlassCard` for plan-list rendering in Home and Discover.

**Tech Stack:** React Native 0.83, Expo SDK 55, expo-linear-gradient, TypeScript, expo-router

---

## File Map

| File | Change |
|---|---|
| `app/(tabs)/discover.tsx` | Fix: `useMemo` for `plansQuery`, `useCallback` for `renderItem` |
| `app/(tabs)/index.tsx` | Fix: merge auth listeners, `useCallback` for archive/pin helpers; then swap GlassCard → PlanCard |
| `lib/theme.ts` | Swap rose palette → amber/gold; add `Shadow.amberStrong`; rename `Shadow.rose`→`Shadow.amber`, `Shadow.roseStrong`→`Shadow.amberStrong` |
| `components/AnimatedButton.tsx` | Swap hardcoded rose gradient for amber |
| `app/(tabs)/_layout.tsx` | Swap `Shadow.roseStrong`→`Shadow.amberStrong`, `Shadow.rose`→`Shadow.amber`; tab bar border color |
| `components/PlanCard.tsx` | **Create new** — full-bleed category gradient banner card |
| `app/(tabs)/index.tsx` | Swap `GlassCard` plan renders → `PlanCard`, amber swipe actions |
| `app/(tabs)/discover.tsx` | Swap inline plan card render → `PlanCard` |
| `app/plan-detail.tsx` | Swap cover section → PlanCard-style category gradient banner |
| `app/(auth)/login.tsx` | Amber logo glow, password strength bar |
| `app/(tabs)/profile.tsx` | Amber hero gradient (`#f43f5e33` → `rgba(217,119,6,0.2)`) |
| `app/chat.tsx` | Amber own-message bubble (hardcoded rose check) |
| `app/create-plan.tsx` | Verify no hardcoded rose; amber cover picker border |
| `app/(tabs)/activity.tsx` | Verify token-only, no hardcoded rose |
| `app/social.tsx` | Verify token-only, no hardcoded rose |
| `app/settings.tsx` | Verify token-only, no hardcoded rose |
| `app/user-profile.tsx` | Verify token-only, no hardcoded rose |

---

## Part 1 — Code Fixes

---

### Task 1: Fix discover.tsx — stable query + renderItem callback

**Files:**
- Modify: `app/(tabs)/discover.tsx`

- [ ] **Step 1: Wrap `plansQuery` in `useMemo`**

In `discover.tsx`, the `plansQuery` is built at component scope (currently around line 116). Wrap it in `useMemo` so the reference is stable across renders:

```typescript
// Replace the bare const plansQuery = query(...) with:
const plansQuery = useMemo(() => query(
  collection(db, 'plans'),
  where('isPublic', '==', true),
  where('status', 'in', ['pending', 'confirmed']),
  orderBy('createdAt', 'desc'),
  limit(50)
), []);
```

Add `useMemo` to the import from `'react'` at the top of the file.

- [ ] **Step 2: Extract `renderItem` to `useCallback`**

Currently `renderItem` is an inline function in the `FlatList` JSX. Extract it:

```typescript
const renderItem = useCallback(({ item, index }: { item: Plan; index: number }) => {
  const joined = isParticipant(item);
  const full = isFull(item);
  const isOwn = item.createdBy === uid;
  const distKm = userCoords && item.lat != null && item.lng != null
    ? haversineKm(userCoords.lat, userCoords.lng, item.lat, item.lng)
    : null;
  return (
    <GlassCard
      index={index}
      onPress={() => router.push({ pathname: '/plan-detail', params: { id: item.id } })}
      glowColor={item.status === 'confirmed' ? Colors.success : Colors.primary}
      style={styles.card}
    >
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={styles.cardCover} />
      ) : (
        <LinearGradient
          colors={['#f43f5e22', '#100d14']}
          style={styles.cardCoverGradient}
        />
      )}
      <View style={styles.cardBody}>
        <View style={styles.metaRow}>
          {item.category ? (
            <View style={styles.catPill}>
              <Text style={styles.catText}>{item.category}</Text>
            </View>
          ) : null}
          {isOwn && (
            <View style={styles.ownPill}>
              <Text style={styles.ownPillText}>Yours</Text>
            </View>
          )}
          <View style={[styles.statusDot, { backgroundColor: item.status === 'confirmed' ? Colors.success : Colors.primary }]} />
          <Text style={[styles.statusLabel, { color: item.status === 'confirmed' ? Colors.success : Colors.primary }]}>
            {item.status}
          </Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.chipsRow}>
          {item.date ? (
            <View style={styles.chip}>
              <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.chipText}>
                {item.date?.seconds
                  ? new Date(item.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : item.date}
              </Text>
            </View>
          ) : null}
          {item.location ? (
            <View style={styles.chip}>
              <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.chipText} numberOfLines={1}>{item.location}</Text>
            </View>
          ) : null}
          {distKm != null ? (
            <View style={[styles.chip, styles.distChip]}>
              <Ionicons name="navigate-outline" size={11} color={Colors.primary} />
              <Text style={[styles.chipText, { color: Colors.primary }]}>{formatDistance(distKm)}</Text>
            </View>
          ) : null}
          <View style={styles.chip}>
            <Ionicons name="people-outline" size={11} color={Colors.textMuted} />
            <Text style={styles.chipText}>
              {item.participants?.length ?? 0}{item.maxParticipants ? `/${item.maxParticipants}` : ''}
            </Text>
          </View>
        </View>
        <QuorumProgressBar votes={item.votes?.length ?? 0} required={item.requiredVotes ?? 1} />
        <TouchableOpacity
          style={[styles.joinBtn, joined && styles.joinBtnJoined, full && !joined && styles.joinBtnFull]}
          onPress={() => joined ? router.push({ pathname: '/plan-detail', params: { id: item.id } }) : full ? undefined : handleJoin(item)}
          disabled={joiningId === item.id || (full && !joined)}
        >
          <Ionicons
            name={joined ? 'checkmark-circle-outline' : full ? 'close-circle-outline' : 'enter-outline'}
            size={15}
            color={joined ? Colors.success : full ? Colors.textMuted : Colors.primary}
          />
          <Text style={[styles.joinBtnText, joined && styles.joinBtnTextJoined, full && !joined && styles.joinBtnTextFull]}>
            {joiningId === item.id ? 'Joining...' : joined ? 'View Plan' : full ? 'Full' : 'Join Plan'}
          </Text>
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
}, [uid, router, joiningId, userCoords, handleJoin]);
```

Then in the `FlatList`, replace `renderItem={({ item, index }) => { ... }}` with `renderItem={renderItem}`.

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/discover.tsx
git commit -m "perf: stable plansQuery useMemo + renderItem useCallback in discover"
```

---

### Task 2: Fix index.tsx — merge auth listeners + stable callbacks

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Merge the two `onAuthStateChanged` subscriptions**

Currently there are two separate `useEffect` blocks that each call `onAuthStateChanged`. Find them — one sets `uid`, one sets `displayName`. Replace both with a single effect:

```typescript
useEffect(() => {
  return onAuthStateChanged(auth, (u) => {
    setUid(u?.uid || '');
    setDisplayName(u?.displayName || u?.email?.split('@')[0] || '');
  });
}, []);
```

Remove the duplicate `useState` initialization for `displayName` that reads from `auth.currentUser` at declaration time (it gets set by the effect). Keep the state declaration as `const [displayName, setDisplayName] = useState('');`.

- [ ] **Step 2: Stabilize `isArchivedForMe` and `isPinnedForMe` with `useCallback`**

Currently these are inline arrow functions defined inside the component body. Change them to:

```typescript
const isArchivedForMe = useCallback(
  (plan: Plan) => plan.archivedBy?.includes(uid) === true,
  [uid]
);

const isPinnedForMe = useCallback(
  (plan: Plan) => plan.pinnedBy?.includes(uid) === true,
  [uid]
);
```

Then update the `filteredPlans` `useMemo` dep array to include both:

```typescript
const filteredPlans = useMemo(() => plans
  .filter((p) => {
    const archived = isArchivedForMe(p);
    if (filter === 'archived') return archived;
    if (archived) return false;
    if (filter === 'all') return true;
    return p.status === filter;
  })
  .filter((p) => {
    if (!search.trim()) return true;
    return p.title.toLowerCase().includes(search.toLowerCase());
  })
  .sort((a, b) => {
    const aPinned = isPinnedForMe(a) ? 1 : 0;
    const bPinned = isPinnedForMe(b) ? 1 : 0;
    return bPinned - aPinned;
  }),
  [plans, filter, search, isArchivedForMe, isPinnedForMe]
);
```

Add `useCallback` to the import from `'react'`.

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "perf: merge auth listeners, useCallback for archive/pin helpers in home"
```

---

## Part 2 — Warm Luxury Revamp

---

### Task 3: Update theme tokens

**Files:**
- Modify: `lib/theme.ts`

- [ ] **Step 1: Replace the full `Colors` object and `Shadow` object**

Replace the entire contents of `lib/theme.ts` with:

```typescript
export const Colors = {
  // Base backgrounds
  background: '#060402',
  backgroundAlt: '#0a0806',

  // Surfaces
  surface: '#0d0a07',
  surfaceRaised: '#1c1005',
  surfaceOverlay: '#2a1a08',

  // Glass
  glass: 'rgba(255,255,255,0.035)',
  glassMid: 'rgba(255,255,255,0.06)',
  glassStrong: 'rgba(255,255,255,0.10)',
  glassBorder: 'rgba(255,255,255,0.06)',
  glassBorderStrong: 'rgba(217,119,6,0.2)',
  glassHighlight: 'rgba(255,255,255,0.07)',

  // Primary — Amber
  primary: '#d97706',
  primaryLight: '#fbbf24',
  primaryDim: 'rgba(217,119,6,0.12)',
  primaryGlow: 'rgba(217,119,6,0.28)',
  primaryBorder: 'rgba(217,119,6,0.35)',

  // Gold (unchanged)
  gold: '#FFD700',
  goldLight: '#FFE55C',
  goldDim: 'rgba(255,215,0,0.12)',
  goldGlow: 'rgba(255,215,0,0.28)',

  // Text
  text: '#fef3c7',
  textSecondary: '#a16207',
  textMuted: '#78350f',
  textDisabled: '#451a03',

  // Status (unchanged)
  success: '#4ade80',
  successDim: 'rgba(74,222,128,0.12)',
  successGlow: 'rgba(74,222,128,0.25)',
  error: '#fb923c',
  errorDim: 'rgba(251,146,60,0.12)',

  // Misc
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.12)',
  overlay: 'rgba(0,0,0,0.75)',
  overlayLight: 'rgba(0,0,0,0.45)',

  // Legacy aliases
  card: '#1c1005',
  cardElevated: '#2a1a08',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  xxl: 32,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,
  black: '900' as const,
};

export const Shadow = {
  amber: {
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  amberStrong: {
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  gold: {
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  dark: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 14,
  },
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  // Legacy aliases so screens referencing Shadow.rose don't crash before they're updated
  rose: {
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  roseStrong: {
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/theme.ts
git commit -m "feat: swap theme tokens from rose to amber — Warm Luxury palette"
```

---

### Task 4: Update AnimatedButton primary gradient

**Files:**
- Modify: `components/AnimatedButton.tsx`

- [ ] **Step 1: Replace the hardcoded rose gradient for `variant === 'primary'`**

Find the block at line 88–95:
```typescript
{variant === 'primary' && (
  <LinearGradient
    colors={['#fb7185', '#f43f5e', '#e11d48']}
    ...
  />
)}
```

Replace with:
```typescript
{variant === 'primary' && (
  <LinearGradient
    colors={['#fbbf24', '#d97706', '#b45309']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full }]}
  />
)}
```

- [ ] **Step 2: Commit**

```bash
git add components/AnimatedButton.tsx
git commit -m "feat: amber gradient for AnimatedButton primary variant"
```

---

### Task 5: Update tab bar — amber shadow + border

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

- [ ] **Step 1: Update `iconWrapActive` shadow**

Find in `styles`:
```typescript
iconWrapActive: {
  backgroundColor: Colors.primaryDim,
  ...Shadow.rose,
},
```
Change `...Shadow.rose` to `...Shadow.amber`.

- [ ] **Step 2: Update `createInner` shadow**

Find in `styles`:
```typescript
createInner: {
  ...
  ...Shadow.roseStrong,
  ...
},
```
Change `...Shadow.roseStrong` to `...Shadow.amberStrong`.

- [ ] **Step 3: Update tab bar top border**

Find in `styles`:
```typescript
barWrap: {
  backgroundColor: Colors.surface,
  borderTopWidth: 1,
  borderTopColor: Colors.glassBorder,
  ...Shadow.dark,
},
```
Change `borderTopColor: Colors.glassBorder` to `borderTopColor: 'rgba(217,119,6,0.3)'`.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/_layout.tsx
git commit -m "feat: amber shadow + border on tab bar"
```

---

### Task 6: Create PlanCard component

**Files:**
- Create: `components/PlanCard.tsx`

- [ ] **Step 1: Create the file**

```typescript
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import QuorumProgressBar from './QuorumProgressBar';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../lib/theme';

export interface PlanCardPlan {
  id: string;
  title: string;
  category?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  date?: string;
  location?: string;
  votes?: string[];
  requiredVotes?: number;
  participants?: string[];
  maxParticipants?: number;
  coverUrl?: string;
}

interface Props {
  plan: PlanCardPlan;
  index?: number;
  onPress?: () => void;
  /** Bottom action slot — pass a button or null */
  action?: React.ReactNode;
}

const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  Food:    ['#451a03', '#c2610a'],
  Travel:  ['#0c2340', '#1e4d8c'],
  Music:   ['#1e0a3c', '#6d28d9'],
  Art:     ['#1a0a2e', '#7e22ce'],
  Gaming:  ['#0a1a0a', '#166534'],
  Sports:  ['#0a1020', '#1e40af'],
  Party:   ['#2a0a1a', '#9d174d'],
  Study:   ['#0a0a18', '#1e3a8a'],
};

const DEFAULT_GRADIENT: [string, string] = ['#1c1005', '#92400e'];

const CATEGORY_EMOJI: Record<string, string> = {
  Music: '🎵', Food: '🍔', Sports: '⚽', Art: '🎨',
  Gaming: '🎮', Travel: '✈️', Party: '🎉', Study: '📚',
};

export default function PlanCard({ plan, index = 0, onPress, action }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const delay = Math.min(index * 60, 240);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 90, friction: 13, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.972, useNativeDriver: true, speed: 80, bounciness: 2 }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 45, bounciness: 10 }).start();

  const gradientColors = CATEGORY_GRADIENTS[plan.category ?? ''] ?? DEFAULT_GRADIENT;
  const statusColor = plan.status === 'confirmed' ? Colors.success : Colors.primary;

  const card = (
    <Animated.View
      style={[
        styles.card,
        { opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      {/* Cover — image or category gradient */}
      {plan.coverUrl ? (
        <>
          <Image source={{ uri: plan.coverUrl }} style={styles.cover} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={styles.coverOverlay}
          />
        </>
      ) : (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cover}
        />
      )}

      {/* Category + status row */}
      <View style={styles.topRow}>
        {plan.category ? (
          <View style={styles.catBadge}>
            <Text style={styles.catText}>
              {CATEGORY_EMOJI[plan.category] ?? '📌'} {plan.category}
            </Text>
          </View>
        ) : <View />}
        <View style={[styles.statusBadge, { borderColor: statusColor + '55' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {plan.status === 'confirmed' ? 'Confirmed' : 'Voting'}
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>{plan.title}</Text>

      {/* Meta chips */}
      <View style={styles.metaRow}>
        {plan.date ? (
          <View style={styles.chip}>
            <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.6)" />
            <Text style={styles.chipText}>{plan.date}</Text>
          </View>
        ) : null}
        {plan.location ? (
          <View style={styles.chip}>
            <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.6)" />
            <Text style={styles.chipText} numberOfLines={1}>{plan.location}</Text>
          </View>
        ) : null}
        {(plan.participants?.length ?? 0) > 0 && (
          <View style={styles.chip}>
            <Ionicons name="people-outline" size={11} color="rgba(255,255,255,0.6)" />
            <Text style={styles.chipText}>
              {plan.participants!.length}
              {plan.maxParticipants ? `/${plan.maxParticipants}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressRow}>
        <QuorumProgressBar
          votes={plan.votes?.length ?? 0}
          required={plan.requiredVotes ?? 3}
        />
      </View>

      {/* Optional action slot */}
      {action ? <View style={styles.actionRow}>{action}</View> : null}
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {card}
      </TouchableOpacity>
    );
  }
  return card;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.25)',
    ...Shadow.amberStrong,
  },
  cover: {
    width: '100%',
    height: 160,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    height: 160,
  },
  topRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catBadge: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  catText: {
    fontSize: FontSize.xs,
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  title: {
    position: 'absolute',
    bottom: 100,
    left: 12,
    right: 12,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: '#fff',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  metaRow: {
    position: 'absolute',
    bottom: 64,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: FontWeight.medium,
  },
  progressRow: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
  },
  actionRow: {
    padding: Spacing.md,
    paddingTop: 0,
    marginTop: 4,
    backgroundColor: Colors.surfaceRaised,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/PlanCard.tsx
git commit -m "feat: add PlanCard component — full-bleed category gradient banner"
```

---

### Task 7: Swap Home screen plan cards → PlanCard

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Add PlanCard import**

Add to imports at top of file:
```typescript
import PlanCard from '../../components/PlanCard';
```

- [ ] **Step 2: Replace GlassCard plan card render inside `SwipeablePlanCard`**

In the `SwipeablePlanCard` function, the `return` currently wraps a `GlassCard` with an inline card body. Replace the entire `<GlassCard>...</GlassCard>` block (from `<GlassCard index={index}` through the closing `</GlassCard>`) with:

```tsx
<PlanCard
  plan={{
    id: item.id,
    title: item.title,
    category: item.category,
    status: item.status === 'cancelled' ? 'pending' : item.status,
    date: item.date,
    location: item.location,
    votes: item.votes,
    requiredVotes: item.requiredVotes,
    participants: item.participants,
    maxParticipants: item.maxParticipants,
    coverUrl: item.coverUrl,
  }}
  index={index}
  onPress={onPress}
  action={
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <TouchableOpacity
        style={styles.chatBtn}
        onPress={(e) => {
          e.stopPropagation();
          Haptics.selectionAsync();
          onChatPress();
        }}
      >
        <Ionicons name="chatbubble-outline" size={13} color={Colors.textSecondary} />
        <Text style={styles.chatBtnText}>Chat</Text>
      </TouchableOpacity>
      <View style={styles.votesChip}>
        <Ionicons name="thumbs-up-outline" size={12} color={Colors.primary} />
        <Text style={styles.votesChipText}>
          {item.votes?.length || 0}/{item.requiredVotes || 3}
        </Text>
      </View>
      {item.votes?.includes(uid) && (
        <View style={styles.votedPill}>
          <Text style={styles.votedPillText}>✓ Voted</Text>
        </View>
      )}
      {isPinned && (
        <Ionicons name="bookmark" size={13} color={Colors.gold} style={{ marginLeft: 'auto' as any }} />
      )}
    </View>
  }
/>
```

Note: The `onLongPress` prop is not passed to `PlanCard` directly since `Swipeable` wraps the whole card — long press can be added to the Swipeable wrapper instead.

- [ ] **Step 3: Remove unused styles**

After the swap, the following styles in `StyleSheet.create` are no longer used by the card body and can be removed:
`coverImage`, `coverGradient`, `cardBody`, `cardTopRow`, `categoryPill`, `categoryPillText`, `statusRow`, `statusDot`, `statusLabel`, `planTitle`, `metaRow`, `metaChip`, `metaText`, `countdownChip`, `countdownChipPending`, `countdownText`, `progressWrapper`.

Keep: `chatBtn`, `chatBtnText`, `votesChip`, `votesChipText`, `votedPill`, `votedPillText`, and all swipe/context/header/search/list styles.

- [ ] **Step 4: Update swipe action colors**

The `swipePin`, `swipeUnpin`, `swipeArchive`, `swipeRestore`, `swipeDelete`, `swipeLeave` styles use `Colors.primary + 'cc'` etc. These will automatically be amber via the new token — no change needed.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: home screen uses PlanCard for plan list"
```

---

### Task 8: Swap Discover screen plan cards → PlanCard

**Files:**
- Modify: `app/(tabs)/discover.tsx`

- [ ] **Step 1: Add PlanCard import**

Add:
```typescript
import PlanCard, { PlanCardPlan } from '../../components/PlanCard';
```

- [ ] **Step 2: Replace inline GlassCard render in `renderItem` with PlanCard**

In the `renderItem` `useCallback` (added in Task 1), replace the entire `<GlassCard>...</GlassCard>` return with:

```tsx
return (
  <PlanCard
    plan={{
      id: item.id,
      title: item.title,
      category: item.category,
      status: item.status === 'archived' ? 'pending' : item.status,
      date: item.date?.seconds
        ? new Date(item.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : (item.date as string | undefined),
      location: item.location,
      votes: item.votes,
      requiredVotes: item.requiredVotes,
      participants: item.participants,
      maxParticipants: item.maxParticipants,
      coverUrl: item.coverUrl,
    }}
    index={index}
    onPress={() => router.push({ pathname: '/plan-detail', params: { id: item.id } })}
    action={
      <TouchableOpacity
        style={[
          styles.joinBtn,
          joined && styles.joinBtnJoined,
          full && !joined && styles.joinBtnFull,
        ]}
        onPress={() =>
          joined
            ? router.push({ pathname: '/plan-detail', params: { id: item.id } })
            : full ? undefined : handleJoin(item)
        }
        disabled={joiningId === item.id || (full && !joined)}
      >
        <Ionicons
          name={joined ? 'checkmark-circle-outline' : full ? 'close-circle-outline' : 'enter-outline'}
          size={15}
          color={joined ? Colors.success : full ? Colors.textMuted : Colors.primary}
        />
        <Text style={[styles.joinBtnText, joined && styles.joinBtnTextJoined, full && !joined && styles.joinBtnTextFull]}>
          {joiningId === item.id ? 'Joining...' : joined ? 'View Plan' : full ? 'Full' : 'Join Plan'}
        </Text>
      </TouchableOpacity>
    }
  />
);
```

- [ ] **Step 3: Remove now-unused styles**

Remove from `StyleSheet.create`: `card`, `cardCover`, `cardCoverGradient`, `cardBody`, `metaRow`, `catPill`, `catText`, `ownPill`, `ownPillText`, `distChip`, `statusDot`, `statusLabel`, `cardTitle`, `chipsRow`, `chip`, `chipText`.

Keep: `header`, `title`, `searchBar`, `searchInput`, `list`, `joinBtn`, `joinBtnJoined`, `joinBtnFull`, `joinBtnText`, `joinBtnTextJoined`, `joinBtnTextFull`, `empty`, `emptyTitle`, `emptySubtitle`.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/discover.tsx
git commit -m "feat: discover screen uses PlanCard for plan list"
```

---

### Task 9: Update plan-detail cover banner

**Files:**
- Modify: `app/plan-detail.tsx`

- [ ] **Step 1: Read the current cover section**

Open `app/plan-detail.tsx` and find the cover/header section at the top of the screen (look for `coverUrl`, `LinearGradient`, or the plan banner). It likely renders the plan's cover image or a gradient.

- [ ] **Step 2: Replace the cover section with a category-gradient banner**

Replace whatever cover rendering exists with:

```tsx
{/* ── Cover banner ── */}
{(() => {
  const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
    Food:    ['#451a03', '#c2610a'],
    Travel:  ['#0c2340', '#1e4d8c'],
    Music:   ['#1e0a3c', '#6d28d9'],
    Art:     ['#1a0a2e', '#7e22ce'],
    Gaming:  ['#0a1a0a', '#166534'],
    Sports:  ['#0a1020', '#1e40af'],
    Party:   ['#2a0a1a', '#9d174d'],
    Study:   ['#0a0a18', '#1e3a8a'],
  };
  const DEFAULT_GRADIENT: [string, string] = ['#1c1005', '#92400e'];
  const gradientColors = CATEGORY_GRADIENTS[plan?.category ?? ''] ?? DEFAULT_GRADIENT;

  return (
    <View style={styles.coverBanner}>
      {plan?.coverUrl ? (
        <>
          <Image source={{ uri: plan.coverUrl }} style={styles.coverBannerImage} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)']}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.coverBannerImage}
        />
      )}
      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color="#fff" />
      </TouchableOpacity>
      {/* Plan title overlay */}
      <View style={styles.coverTitleArea}>
        <Text style={styles.coverTitle} numberOfLines={2}>{plan?.title}</Text>
        {plan?.category && (
          <View style={styles.coverCatBadge}>
            <Text style={styles.coverCatText}>{plan.category}</Text>
          </View>
        )}
      </View>
    </View>
  );
})()}
```

Add these styles to `StyleSheet.create`:
```typescript
coverBanner: {
  width: '100%',
  height: 200,
  position: 'relative',
},
coverBannerImage: {
  width: '100%',
  height: 200,
},
backBtn: {
  position: 'absolute',
  top: 16,
  left: 16,
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: 'rgba(0,0,0,0.45)',
  alignItems: 'center',
  justifyContent: 'center',
},
coverTitleArea: {
  position: 'absolute',
  bottom: 16,
  left: 16,
  right: 16,
  gap: 6,
},
coverTitle: {
  fontSize: FontSize.xxl,
  fontWeight: FontWeight.black,
  color: '#fff',
  letterSpacing: -0.5,
  textShadowColor: 'rgba(0,0,0,0.6)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
},
coverCatBadge: {
  alignSelf: 'flex-start',
  backgroundColor: 'rgba(0,0,0,0.45)',
  borderRadius: Radius.full,
  paddingHorizontal: 10,
  paddingVertical: 3,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.15)',
},
coverCatText: {
  fontSize: FontSize.xs,
  color: '#fff',
  fontWeight: FontWeight.semibold,
},
```

Remove any previous cover-related styles that are superseded.

- [ ] **Step 3: Commit**

```bash
git add app/plan-detail.tsx
git commit -m "feat: plan-detail cover uses category gradient banner"
```

---

### Task 10: Update remaining screens — hardcoded rose sweep

**Files:**
- Modify: `app/(auth)/login.tsx`
- Modify: `app/(tabs)/profile.tsx`
- Modify: `app/chat.tsx`
- Modify: `app/create-plan.tsx`
- Modify: `app/(tabs)/activity.tsx`
- Modify: `app/social.tsx`
- Modify: `app/settings.tsx`

- [ ] **Step 1: Search all files for hardcoded rose values**

Run:
```bash
grep -rn "#f43f5e\|#fb7185\|#e11d48\|rose" app/ components/ --include="*.tsx" --include="*.ts"
```

This lists every file and line that still references rose hex values or the word "rose".

- [ ] **Step 2: Replace in `app/(auth)/login.tsx`**

Find any instances of:
- `'#f43f5e'` → replace with `Colors.primary`
- `'#fb7185'` → replace with `Colors.primaryLight`
- `Shadow.rose` → `Shadow.amber`
- `Shadow.roseStrong` → `Shadow.amberStrong`
- Password strength bar: find the segment color array for "Fair" and "Strong" levels. Replace rose/red mid-level with amber:
  ```typescript
  // Strength levels: weak, fair, strong, very strong
  const strengthColors = ['#ef4444', '#d97706', '#fbbf24', '#fde68a'];
  ```

- [ ] **Step 3: Replace in `app/(tabs)/profile.tsx`**

Find the hero gradient (likely `'#f43f5e33'` or similar). Replace:
- `'#f43f5e33'` → `'rgba(217,119,6,0.2)'`
- Any other hardcoded rose values → `Colors.primary` or `Colors.primaryBorder`

- [ ] **Step 4: Replace in `app/chat.tsx`**

Find own-message bubble styles. Look for rose-colored background or border on sent messages. Replace:
- Any `'#f43f5e'` background → `Colors.primaryDim`
- Any `'#f43f5e'` border → `Colors.primaryBorder`
- Send button rose color → `Colors.primary` (automatic via token if already using it)

- [ ] **Step 5: Verify `app/create-plan.tsx`, `activity.tsx`, `social.tsx`, `settings.tsx`**

For each of these files, check the grep output from Step 1. If no hardcoded rose values appear, no changes are needed — the token swap in Task 3 handles them automatically.

If any appear, replace with the corresponding amber token (`Colors.primary`, `Colors.primaryDim`, etc.).

- [ ] **Step 6: Commit**

```bash
git add app/(auth)/login.tsx app/(tabs)/profile.tsx app/chat.tsx app/create-plan.tsx app/(tabs)/activity.tsx app/social.tsx app/settings.tsx
git commit -m "feat: replace hardcoded rose values with amber tokens across remaining screens"
```

---

### Task 11: Verify `app/user-profile.tsx` + final check

**Files:**
- Modify (if needed): `app/user-profile.tsx` (or `app/user-profile/[id].tsx` — check actual path with `ls app/`)

- [ ] **Step 1: Locate the file**

```bash
ls app/
```

Find the user-profile screen (may be `user-profile.tsx` or inside a folder).

- [ ] **Step 2: Check for hardcoded rose**

```bash
grep -n "#f43f5e\|#fb7185\|Shadow\.rose\|primaryGlow" app/user-profile.tsx
```

Replace any found values with amber equivalents.

- [ ] **Step 3: Final rose sweep across entire project**

```bash
grep -rn "#f43f5e\|#fb7185\|#e11d48" app/ components/ lib/ --include="*.tsx" --include="*.ts"
```

Expected output: no matches (the only remaining `rose`/`roseStrong` references are the legacy aliases in `lib/theme.ts` which are intentional).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Warm Luxury revamp — amber palette, PlanCard, category banners"
```
