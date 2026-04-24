# Warm Luxury UI Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Carbon Rose dark theme with a Warm Luxury aesthetic — amber/gold on deep brown-black — and introduce a new `PlanCard` Dark Cover Banner component replacing `GlassCard` for all plan renders.

**Architecture:** Theme tokens in `lib/theme.ts` are the single source of truth. Tasks 1–7 update the foundation (tokens + components). Tasks 8–19 update screens. Because all screens already reference tokens, most screen tasks are shallow — only plan-card swap sites and explicit color overrides need touching. `PlanCard` (Task 2) must be created before Tasks 9 and 10.

**Tech Stack:** React Native, Expo SDK 55, expo-linear-gradient, TypeScript

---

## File Map

| File | Action | What changes |
|---|---|---|
| `lib/theme.ts` | Modify | 21 token values + `Shadow.amberStrong` |
| `components/PlanCard.tsx` | **Create** | New Dark Cover Banner plan card |
| `components/GlassCard.tsx` | Modify | Border color default → amber |
| `components/AnimatedButton.tsx` | Modify | `primary` gradient → amber |
| `components/CategoryPill.tsx` | Modify | Inherits from tokens (no-op if tokens already updated) |
| `components/QuorumProgressBar.tsx` | Modify | Inherits from tokens (no-op) |
| `components/Toast.tsx` | Modify | Inherits from tokens (no-op) |
| `app/(tabs)/_layout.tsx` | Modify | Border color + shadow token |
| `app/(tabs)/index.tsx` | Modify | Swap `GlassCard` plan renders → `PlanCard`; swipe action color |
| `app/(tabs)/discover.tsx` | Modify | Swap `GlassCard` plan renders → `PlanCard` |
| `app/(auth)/login.tsx` | Modify | Logo/glow, password strength bar |
| `app/plan-detail.tsx` | Modify | Cover banner → PlanCard-style gradient |
| `app/create-plan.tsx` | Modify | Token-driven (already uses tokens) |
| `app/(tabs)/profile.tsx` | Modify | Hero gradient, avatar ring |
| `app/(tabs)/activity.tsx` | Modify | Icon circle color |
| `app/chat.tsx` | Modify | Own message bubble |
| `app/social.tsx` | Modify | Inherits from tokens (no-op) |
| `app/settings.tsx` | Modify | Toggle switch active color |
| `app/user-profile.tsx` | Modify | Inherits from tokens (no-op) |

---

## Task 1 — Update theme tokens (`lib/theme.ts`)

**Files:**
- Modify: `lib/theme.ts`

- [ ] **Step 1: Replace all 21 color tokens and add `Shadow.amberStrong`**

Open `lib/theme.ts` and apply the following changes exactly. Replace the entire file with:

```typescript
export const Colors = {
  // Base backgrounds
  background: '#060402',
  backgroundAlt: '#0a0806',

  // Surfaces (elevation layers)
  surface: '#0d0a07',
  surfaceRaised: '#1c1005',
  surfaceOverlay: '#2a1a08',

  // Glass (semi-transparent overlays for cards)
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

  // Gold
  gold: '#FFD700',
  goldLight: '#FFE55C',
  goldDim: 'rgba(255,215,0,0.12)',
  goldGlow: 'rgba(255,215,0,0.28)',

  // Text
  text: '#fef3c7',
  textSecondary: '#a16207',
  textMuted: '#78350f',
  textDisabled: '#451a03',

  // Status
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

  // Legacy aliases (keep so old screens don't crash during migration)
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
  // Keep rose/roseStrong as aliases pointing to amber so any remaining
  // references don't crash until they're updated in later tasks.
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
};
```

- [ ] **Step 2: Visual sanity check**

Run the app (`npx expo start`) and open any screen. The backgrounds should now be deep warm brown-black instead of purple-black. No crashes expected since `rose`/`roseStrong` are kept as aliases.

- [ ] **Step 3: Commit**

```bash
git add lib/theme.ts
git commit -m "feat: replace Carbon Rose tokens with Warm Luxury amber palette"
```

---

## Task 2 — Create `PlanCard` component

**Files:**
- Create: `components/PlanCard.tsx`

This is the new Dark Cover Banner plan card. Every plan list in Home and Discover will use this instead of the inline `GlassCard` + body styling approach.

- [ ] **Step 1: Create `components/PlanCard.tsx`**

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
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

// Category → [darkBase, brightAccent] gradient stops
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

interface PlanCardPlan {
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
  uid?: string;
}

export default function PlanCard({ plan, index = 0, onPress, uid }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const delay = Math.min(index * 60, 240);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 300, delay, useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0, tension: 90, friction: 13, delay, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.972, useNativeDriver: true, speed: 80, bounciness: 2 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 45, bounciness: 10 }).start();

  const [gradStart, gradEnd] = CATEGORY_GRADIENTS[plan.category ?? ''] ?? DEFAULT_GRADIENT;
  const votes = plan.votes?.length ?? 0;
  const required = plan.requiredVotes ?? 1;
  const progressRatio = Math.min(votes / Math.max(required, 1), 1);
  const reached = votes >= required;

  const statusLabel =
    plan.status === 'confirmed' ? 'Confirmed' :
    plan.status === 'cancelled' ? 'Cancelled' : 'Pending';

  const statusBg =
    plan.status === 'confirmed' ? Colors.successDim :
    plan.status === 'cancelled' ? 'rgba(120,53,15,0.5)' :
    'rgba(217,119,6,0.25)';

  const statusColor =
    plan.status === 'confirmed' ? Colors.success :
    plan.status === 'cancelled' ? Colors.textMuted :
    Colors.primaryLight;

  const participants = plan.participants?.length ?? 0;
  const emoji = CATEGORY_EMOJI[plan.category ?? ''] ?? '📌';

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.card,
          { opacity, transform: [{ translateY }, { scale }] },
        ]}
      >
        {/* Background: cover image or category gradient */}
        {plan.coverUrl ? (
          <Image
            source={{ uri: plan.coverUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={[gradStart, gradEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* Dark overlay for text legibility */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Content */}
        <View style={styles.content}>
          {/* Top row: category badge + status badge */}
          <View style={styles.topRow}>
            {plan.category ? (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>
                  {emoji} {plan.category.toUpperCase()}
                </Text>
              </View>
            ) : <View />}

            <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title} numberOfLines={2}>{plan.title}</Text>

          {/* Meta row */}
          <View style={styles.metaRow}>
            {plan.date ? (
              <View style={styles.metaChip}>
                <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.7)" />
                <Text style={styles.metaText}>{plan.date}</Text>
              </View>
            ) : null}
            {plan.location ? (
              <View style={styles.metaChip}>
                <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.7)" />
                <Text style={styles.metaText} numberOfLines={1}>{plan.location}</Text>
              </View>
            ) : null}
            {participants > 0 && (
              <View style={styles.metaChip}>
                <Ionicons name="people-outline" size={11} color="rgba(255,255,255,0.7)" />
                <Text style={styles.metaText}>{participants}</Text>
              </View>
            )}
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(progressRatio * 100, 3)}%` as any },
              ]}
            >
              <LinearGradient
                colors={reached ? [Colors.goldLight, Colors.gold] : [Colors.primaryLight, Colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: 12,
    minHeight: 140,
    position: 'relative',
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 140,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.xs,
  },
  categoryBadgeText: {
    color: '#fde68a',
    fontSize: FontSize.xs - 1,
    fontWeight: FontWeight.black,
    letterSpacing: 1.2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  statusBadgeText: {
    fontSize: FontSize.xs - 1,
    fontWeight: FontWeight.black,
    letterSpacing: 0.8,
  },
  title: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    letterSpacing: -0.5,
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    flex: 1,
    marginVertical: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  metaText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
});
```

- [ ] **Step 2: Verify file created with no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: no errors relating to `PlanCard.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/PlanCard.tsx
git commit -m "feat: add PlanCard Dark Cover Banner component"
```

---

## Task 3 — Update `GlassCard` border default

**Files:**
- Modify: `components/GlassCard.tsx:61-63`

- [ ] **Step 1: Change the default border color**

In `components/GlassCard.tsx`, find the `borderColor` derivation:

```typescript
  const borderColor = glowColor
    ? glowColor + '55'
    : Colors.glassBorder;
```

Change it to:

```typescript
  const borderColor = glowColor
    ? glowColor + '55'
    : 'rgba(217,119,6,0.18)';
```

- [ ] **Step 2: Verify visually**

Any screen using `GlassCard` without a `glowColor` prop should now have a faint amber border instead of the old white-tinted border.

- [ ] **Step 3: Commit**

```bash
git add components/GlassCard.tsx
git commit -m "fix: update GlassCard default border to amber tint"
```

---

## Task 4 — Update `AnimatedButton` primary gradient

**Files:**
- Modify: `components/AnimatedButton.tsx:89-95`

- [ ] **Step 1: Swap primary gradient colors**

In `components/AnimatedButton.tsx`, find:

```typescript
        {variant === 'primary' && (
          <LinearGradient
            colors={['#fb7185', '#f43f5e', '#e11d48']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full }]}
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

- [ ] **Step 2: Verify visually**

Any screen with a `variant="primary"` button should now render an amber/gold gradient instead of rose/red.

- [ ] **Step 3: Commit**

```bash
git add components/AnimatedButton.tsx
git commit -m "fix: update AnimatedButton primary variant to amber gradient"
```

---

## Task 5 — Verify token-driven components

`CategoryPill`, `QuorumProgressBar`, and `Toast` all reference `Colors.primary*` tokens directly. Because Task 1 changed those tokens, no code changes are needed. This task confirms they look correct.

**Files:**
- Read: `components/CategoryPill.tsx` (verify it uses `Colors.primaryDim`, `Colors.primaryBorder`, `Colors.primary`)
- Read: `components/QuorumProgressBar.tsx` (verify it uses `Colors.primaryLight`, `Colors.primary`)
- Read: `components/Toast.tsx` (verify it uses `Colors.primaryDim` for `info` type)

- [ ] **Step 1: Confirm no hardcoded rose hex values in these files**

Run:
```bash
grep -n "f43f5e\|fb7185\|e11d48" components/CategoryPill.tsx components/QuorumProgressBar.tsx components/Toast.tsx
```
Expected: no output (no matches).

- [ ] **Step 2: Commit (no-op if nothing changed)**

If grep found hardcoded rose values, replace them with the appropriate token reference. Otherwise skip this commit.

---

## Task 6 — Update Tab Bar (`app/(tabs)/_layout.tsx`)

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

Three changes: (1) top border color → amber, (2) create button shadow → `Shadow.amberStrong`, (3) create button `backgroundColor` stays token-driven but use amber explicitly since it uses `Colors.primary` inline.

- [ ] **Step 1: Update `barWrap` top border color**

Find in `app/(tabs)/_layout.tsx`:

```typescript
  barWrap: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
    ...Shadow.dark,
  },
```

Replace with:

```typescript
  barWrap: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(217,119,6,0.3)',
    ...Shadow.dark,
  },
```

- [ ] **Step 2: Update create button inner to use `Shadow.amberStrong` and amber border**

Find:

```typescript
  createInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.roseStrong,
    borderWidth: 2,
    borderColor: Colors.primaryLight + '55',
  },
```

Replace with:

```typescript
  createInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.amberStrong,
    borderWidth: 2,
    borderColor: Colors.primaryLight + '55',
  },
```

- [ ] **Step 3: Verify visually**

The tab bar should now have a warm amber top border. The center create button should have an amber glow shadow.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/_layout.tsx"
git commit -m "fix: update tab bar to amber border and amberStrong shadow"
```

---

## Task 7 — Home screen: swap plan cards to `PlanCard` (`app/(tabs)/index.tsx`)

**Files:**
- Modify: `app/(tabs)/index.tsx`

The `SwipeablePlanCard` function wraps `GlassCard` with all the inline card styling. Replace the `GlassCard` + inline body with `PlanCard`. The swipe actions stay; only the card content changes. Also update swipe action background color from rose to amber.

- [ ] **Step 1: Add `PlanCard` import**

Find the existing imports block near the top of `app/(tabs)/index.tsx`. After:

```typescript
import GlassCard from '../../components/GlassCard';
```

Add:

```typescript
import PlanCard from '../../components/PlanCard';
```

- [ ] **Step 2: Replace the `GlassCard` render inside `SwipeablePlanCard`**

Find the section starting with `return (` inside `SwipeablePlanCard` (around line 760). The entire `<GlassCard ...>` block including the cover image, `cardBody`, and all inline content ends before the `</Swipeable>` closing tag.

Replace from `<GlassCard` through `</GlassCard>` with:

```typescript
      <PlanCard
        plan={{
          id: item.id,
          title: item.title,
          category: item.category,
          status: item.status,
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
        uid={uid}
      />
```

Note: `onLongPress` for the context menu is now handled by wrapping the `PlanCard`'s `TouchableOpacity` — but `PlanCard` only supports `onPress`. To preserve long-press, wrap `PlanCard` in a separate `TouchableOpacity` inside `Swipeable`:

```typescript
  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      rightThreshold={40}
      friction={2}
    >
      <TouchableOpacity
        activeOpacity={1}
        onLongPress={onLongPress}
        delayLongPress={400}
      >
        <PlanCard
          plan={{
            id: item.id,
            title: item.title,
            category: item.category,
            status: item.status,
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
          uid={uid}
        />
      </TouchableOpacity>
    </Swipeable>
  );
```

- [ ] **Step 3: Update swipe action backgrounds from rose to amber**

Find in the `StyleSheet.create` block at the bottom of the file. Look for swipe action styles that reference rose colors (hardcoded `#f43f5e` or `Colors.primary` used as background). Update any swipe pill background that was rose:

Find:
```typescript
  swipeArchive: {
    backgroundColor: Colors.primary,
```
(and similar `swipePin`, `swipeDelete`, `swipeRestore`, `swipeLeave` backgrounds that were rose)

All swipe action background references to `Colors.primary` will automatically be amber after Task 1. Verify no hardcoded rose hex (`f43f5e`) exists in this file:

```bash
grep -n "f43f5e" "app/(tabs)/index.tsx"
```

Expected: no output.

- [ ] **Step 4: Remove unused imports**

If `QuorumProgressBar` is now only used inside `PlanCard` and not directly in `index.tsx`, remove its import. Check with:
```bash
grep -n "QuorumProgressBar" "app/(tabs)/index.tsx"
```
If no remaining usages, remove the import line.

- [ ] **Step 5: Update avatar gradient**

Find in the JSX:
```typescript
              <LinearGradient
                colors={[Colors.primary, '#7c3aed']}
                style={styles.avatarGradient}
              >
```
Replace with:
```typescript
              <LinearGradient
                colors={[Colors.primary, '#92400e']}
                style={styles.avatarGradient}
              >
```

- [ ] **Step 6: Verify visually**

Run the app. Home screen plan cards should now be full-bleed gradient Dark Cover Banners. Swipe left/right should still work.

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat: swap Home plan cards to PlanCard Dark Cover Banner"
```

---

## Task 8 — Discover screen: swap plan cards to `PlanCard` (`app/(tabs)/discover.tsx`)

**Files:**
- Modify: `app/(tabs)/discover.tsx`

- [ ] **Step 1: Add `PlanCard` import**

In `app/(tabs)/discover.tsx`, after:
```typescript
import GlassCard from '../../components/GlassCard';
```
Add:
```typescript
import PlanCard from '../../components/PlanCard';
```

- [ ] **Step 2: Locate the `renderItem` function that renders each discover plan**

Find the `renderItem` or inline render function where `<GlassCard` is used to render a discover plan card. It contains the cover image, title, meta chips, join button, etc.

Replace the entire `<GlassCard ...>...</GlassCard>` block for each plan item with:

```typescript
    <View key={plan.id} style={{ marginHorizontal: Spacing.md }}>
      <PlanCard
        plan={{
          id: plan.id,
          title: plan.title,
          category: plan.category,
          status: plan.status as 'pending' | 'confirmed' | 'cancelled',
          date: typeof plan.date === 'string' ? plan.date : undefined,
          location: plan.location,
          votes: plan.votes,
          requiredVotes: plan.requiredVotes,
          participants: plan.participants,
          coverUrl: plan.coverUrl,
        }}
        index={index}
        onPress={() => router.push({ pathname: '/plan-detail', params: { id: plan.id } })}
        uid={uid}
      />
      {/* Join button row — rendered below the card for discover */}
      <View style={styles.discoverActions}>
        {plan.createdBy === uid ? (
          <View style={[styles.yoursBadge]}>
            <Text style={styles.yoursText}>Your plan</Text>
          </View>
        ) : !plan.participants?.includes(uid) ? (
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => handleJoin(plan.id)}
            activeOpacity={0.8}
          >
            <Text style={styles.joinBtnText}>Join</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.joinedBadge}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
            <Text style={styles.joinedText}>Joined</Text>
          </View>
        )}
        {plan.distanceKm !== undefined && (
          <View style={styles.distanceChip}>
            <Ionicons name="location-outline" size={11} color={Colors.primaryLight} />
            <Text style={styles.distanceText}>{formatDistance(plan.distanceKm)}</Text>
          </View>
        )}
      </View>
    </View>
```

Add/update the relevant styles for `discoverActions`, `yoursBadge`, `yoursText`, `joinBtn`, `joinBtnText`, `joinedBadge`, `joinedText`, `distanceChip`, `distanceText` in the `StyleSheet.create` at the bottom of the file:

```typescript
  discoverActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: -4,
    marginBottom: 8,
  },
  yoursBadge: {
    backgroundColor: Colors.goldDim,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.gold + '40',
  },
  yoursText: {
    color: Colors.gold,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  joinBtn: {
    backgroundColor: Colors.primaryDim,
    borderRadius: Radius.full,
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  joinBtnText: {
    color: Colors.primaryLight,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  joinedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successDim,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  joinedText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  distanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primaryDim,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  distanceText: {
    color: Colors.primaryLight,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
```

- [ ] **Step 3: Remove unused imports**

If `QuorumProgressBar` and the old `GlassCard` plan render styles are no longer used, remove them. Check:
```bash
grep -n "GlassCard\|QuorumProgressBar" "app/(tabs)/discover.tsx"
```
Remove any import lines with no remaining usage.

- [ ] **Step 4: Verify visually**

Discover screen plan cards should be full-bleed Dark Cover Banners with the join/distance row below each card.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/discover.tsx"
git commit -m "feat: swap Discover plan cards to PlanCard Dark Cover Banner"
```

---

## Task 9 — Login screen (`app/(auth)/login.tsx`)

**Files:**
- Modify: `app/(auth)/login.tsx`

- [ ] **Step 1: Update logo `Q` circle and glow**

Find the logo circle style in `app/(auth)/login.tsx`. Look for the `Q` letter display with `Colors.primary` or a hardcoded rose background. Update any rose-specific values:

Search for hardcoded `#f43f5e` or `rgba(244,63,94`:
```bash
grep -n "f43f5e\|244,63,94\|fb7185" "app/(auth)/login.tsx"
```

Replace each match:
- `#f43f5e` → `Colors.primary`
- `rgba(244,63,94,X)` → `rgba(217,119,6,X)`
- `#fb7185` → `Colors.primaryLight`

Since `Colors.primary` already resolves to `#d97706` after Task 1, any reference through the token is already updated. Only hardcoded hex values need replacing.

- [ ] **Step 2: Update password strength bar segment colors**

Find the password strength indicator. It typically has 4 segments with color logic like:
```typescript
strength >= 1 ? '#ef4444' : Colors.surface  // Weak
strength >= 2 ? '#f97316' : Colors.surface  // Fair
strength >= 3 ? '#22c55e' : Colors.surface  // Strong
strength >= 4 ? '#22c55e' : Colors.surface  // Very strong
```

Replace strength bar segment colors with:
```typescript
// Weak (1): keep red
strength >= 1 ? '#ef4444' : Colors.surface
// Fair (2): amber
strength >= 2 ? '#d97706' : Colors.surface
// Strong (3): amber light
strength >= 3 ? '#fbbf24' : Colors.surface
// Very strong (4): amber pale
strength >= 4 ? '#fde68a' : Colors.surface
```

If the password strength bar is implemented differently (e.g., as a progress bar width), locate the color logic and apply the same 4-color scale: `#ef4444` → `#d97706` → `#fbbf24` → `#fde68a`.

- [ ] **Step 3: Verify no remaining hardcoded rose hex values**

```bash
grep -n "f43f5e\|244,63,94\|fb7185\|e11d48" "app/(auth)/login.tsx"
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/login.tsx"
git commit -m "fix: update login screen to amber palette"
```

---

## Task 10 — Plan Detail screen (`app/plan-detail.tsx`)

**Files:**
- Modify: `app/plan-detail.tsx`

- [ ] **Step 1: Replace cover banner gradient with category-aware amber gradient**

Find the top cover section. It currently uses a hardcoded rose gradient or `Colors.primary` for the cover gradient. Replace with the same category gradient logic used in `PlanCard`.

Add the `CATEGORY_GRADIENTS` map at the top of the file (after imports):

```typescript
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
```

Find the cover `LinearGradient` in plan-detail (or the cover image fallback gradient). Change it to use the category-aware stops:

```typescript
// Derive gradient from plan category
const [gradStart, gradEnd] = CATEGORY_GRADIENTS[plan?.category ?? ''] ?? DEFAULT_GRADIENT;

// In JSX (replace existing gradient):
<LinearGradient
  colors={[gradStart, gradEnd]}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 1 }}
  style={StyleSheet.absoluteFillObject}
/>
```

- [ ] **Step 2: Replace all hardcoded rose values**

```bash
grep -n "f43f5e\|244,63,94\|fb7185\|e11d48" "app/plan-detail.tsx"
```

Replace each:
- `#f43f5e` → `Colors.primary`
- `rgba(244,63,94,X)` → `rgba(217,119,6,X)`
- `#fb7185` → `Colors.primaryLight`
- `#e11d48` → `#b45309`

- [ ] **Step 3: Update vote button gradient**

Find the vote `AnimatedButton`. If `variant="primary"` is used, it will already be amber after Task 4. If a custom gradient is hardcoded, update:

```typescript
// Find any custom vote button gradient colors:
// ['#fb7185', '#f43f5e', ...] → ['#fbbf24', '#d97706', '#b45309']
```

- [ ] **Step 4: Verify no remaining hardcoded rose hex values**

```bash
grep -n "f43f5e\|244,63,94\|fb7185\|e11d48" "app/plan-detail.tsx"
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/plan-detail.tsx
git commit -m "fix: update plan-detail cover and accents to amber/warm luxury"
```

---

## Task 11 — Profile screen (`app/(tabs)/profile.tsx`)

**Files:**
- Modify: `app/(tabs)/profile.tsx`

- [ ] **Step 1: Update hero gradient**

Find the hero/banner area `LinearGradient`. It typically starts with a rose tint:
```typescript
colors={['#f43f5e33', Colors.background]}
```
Replace with:
```typescript
colors={['rgba(217,119,6,0.2)', Colors.background]}
```

- [ ] **Step 2: Update avatar ring**

Find the avatar container border color. If it uses `Colors.primaryBorder`, it's already updated via tokens. If hardcoded (`#f43f5e`-based), replace with `Colors.primaryBorder`.

- [ ] **Step 3: Update camera badge**

Find the camera icon badge background. If `Colors.primary` — already updated. If hardcoded rose, replace with `Colors.primary`.

- [ ] **Step 4: Verify no remaining hardcoded rose hex values**

```bash
grep -n "f43f5e\|244,63,94\|fb7185\|e11d48" "app/(tabs)/profile.tsx"
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/profile.tsx"
git commit -m "fix: update profile screen hero gradient and avatar ring to amber"
```

---

## Task 12 — Activity screen (`app/(tabs)/activity.tsx`)

**Files:**
- Modify: `app/(tabs)/activity.tsx`

- [ ] **Step 1: Find and replace hardcoded rose values**

```bash
grep -n "f43f5e\|244,63,94\|fb7185\|e11d48" "app/(tabs)/activity.tsx"
```

Replace each with the amber equivalent:
- `#f43f5e` → `Colors.primary`
- `rgba(244,63,94,X)` → `rgba(217,119,6,X)`
- `#fb7185` → `Colors.primaryLight`

Any icon circle for `plan_joined` that uses a hardcoded rose color should use `Colors.primary`.

- [ ] **Step 2: Commit**

```bash
git add "app/(tabs)/activity.tsx"
git commit -m "fix: update activity screen icon circles to amber"
```

---

## Task 13 — Chat screen (`app/chat.tsx`)

**Files:**
- Modify: `app/chat.tsx`

- [ ] **Step 1: Update own-message bubble**

Find the own-message bubble style. It currently uses rose dim:
```typescript
// Own message bubble background
backgroundColor: Colors.primaryDim,
borderColor: Colors.primaryBorder,
```
These reference tokens already updated in Task 1. If hardcoded, replace:
- `rgba(244,63,94,0.12)` → `rgba(217,119,6,0.12)` (or `Colors.primaryDim`)
- `rgba(244,63,94,0.35)` → `rgba(217,119,6,0.35)` (or `Colors.primaryBorder`)

- [ ] **Step 2: Update send button and any rose-specific values**

```bash
grep -n "f43f5e\|244,63,94\|fb7185\|e11d48" "app/chat.tsx"
```
Replace each with amber equivalent.

- [ ] **Step 3: Commit**

```bash
git add app/chat.tsx
git commit -m "fix: update chat screen own-message bubble and send button to amber"
```

---

## Task 14 — Settings screen (`app/settings.tsx`)

**Files:**
- Modify: `app/settings.tsx`

- [ ] **Step 1: Update toggle switch active track color**

Find the toggle/switch active color. React Native `Switch` has a `trackColor` prop:
```typescript
<Switch
  trackColor={{ false: Colors.surface, true: Colors.primary }}
  ...
/>
```
`Colors.primary` is already amber after Task 1. If hardcoded with a rose value, replace with `Colors.primary`.

- [ ] **Step 2: Verify no remaining hardcoded rose hex values**

```bash
grep -n "f43f5e\|244,63,94\|fb7185\|e11d48" "app/settings.tsx"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/settings.tsx
git commit -m "fix: update settings screen toggle active color to amber"
```

---

## Task 15 — Remaining screens: rose hex purge

Screens `app/social.tsx`, `app/user-profile.tsx`, and `app/create-plan.tsx` should already inherit the amber palette through tokens. This task is a final hardcoded-hex purge pass.

**Files:**
- Modify: `app/social.tsx`, `app/user-profile.tsx`, `app/create-plan.tsx`

- [ ] **Step 1: Grep all three files for rose hex values**

```bash
grep -rn "f43f5e\|244,63,94\|fb7185\|e11d48" app/social.tsx app/user-profile.tsx app/create-plan.tsx
```

- [ ] **Step 2: Replace any matches**

For each match:
- `#f43f5e` → `Colors.primary`
- `rgba(244,63,94,X)` → `rgba(217,119,6,X)` (or `Colors.primaryDim`/`Colors.primaryGlow`/`Colors.primaryBorder` as appropriate)
- `#fb7185` → `Colors.primaryLight`
- `#e11d48` → `#b45309`

Add `import { Colors } from '...'` at the top of any file that didn't already import it.

- [ ] **Step 3: Commit**

```bash
git add app/social.tsx app/user-profile.tsx app/create-plan.tsx
git commit -m "fix: purge hardcoded rose hex from social, user-profile, create-plan"
```

---

## Task 16 — Final rose hex purge (whole codebase)

- [ ] **Step 1: Search all TypeScript/TSX files for remaining rose values**

```bash
grep -rn "f43f5e\|244,63,94\|fb7185\|e11d48" --include="*.ts" --include="*.tsx" .
```

- [ ] **Step 2: Fix any remaining matches**

Replace each with the amber equivalent using the same mapping as Task 15. If a file has many hits, read the file first to understand context before editing.

- [ ] **Step 3: Verify the gradient in `SwipeablePlanCard` (home) is not still rose**

Check:
```bash
grep -n "f43f5e" "app/(tabs)/index.tsx"
```
Expected: no output (the coverGradient placeholder was `#f43f5e22` in the old code — it should now be removed since `PlanCard` handles its own background).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: final rose hex purge across all screens"
```

---

## Self-Review Checklist

After all tasks are complete, verify end-to-end:

- [ ] `lib/theme.ts` has no `#f43f5e`, `#fb7185` in token values
- [ ] `PlanCard` renders correctly in Home and Discover (gradient + title + meta + progress bar)
- [ ] Tab bar has amber top border and amber glow on create button
- [ ] All `AnimatedButton variant="primary"` show amber gradient
- [ ] Category pills show amber active state
- [ ] Progress bars show amber pending gradient
- [ ] Login screen has amber logo glow and amber password strength scale
- [ ] Plan detail cover uses category gradient
- [ ] Profile hero has `rgba(217,119,6,0.2)` top tint
- [ ] Chat own-message bubble is amber dim
- [ ] Settings toggles are amber when active
- [ ] No remaining `f43f5e` in any `.ts`/`.tsx` file
