# Minimalist Spacing & Layout Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every screen match the Stitch Minimalist design — sharp corners, generous spacing, flat cards, underline tabs.

**Architecture:** Global theme tokens change first (Radius + Spacing), then shared components adopt them, then each screen's StyleSheet is updated. Since all screens import from `lib/theme`, the token changes cascade automatically wherever `Radius.*` and `Spacing.*` are used; remaining inline/hardcoded values are fixed per-file.

**Tech Stack:** React Native, Expo Router, `lib/theme.ts` design tokens, StyleSheet

---

## Files Modified

| File | Change |
|------|--------|
| `lib/theme.ts` | Flatten Radius scale, bump Spacing scale |
| `components/AnimatedButton.tsx` | Remove gradient, borderRadius → 4px |
| `components/GlassCard.tsx` | Remove glass highlight + shadow, borderRadius → 0, add border |
| `components/AnimatedCard.tsx` | borderRadius → 0, shadow → border, padding → 20 |
| `components/QuorumProgressBar.tsx` | height → 6px, borderRadius → 0 |
| `components/CategoryPill.tsx` | borderRadius → 4, padding bump |
| `app/(tabs)/_layout.tsx` | Tab bar white bg, active = top border, remove shadow |
| `app/(tabs)/index.tsx` | Section labels, card padding, cover height, dividers |
| `app/(tabs)/profile.tsx` | Stats dividers, section margins, flat bars |
| `app/(tabs)/discover.tsx` | Cover height, card body, pill/chip corners |
| `app/plan-detail.tsx` | Underline tabs, flat location card, full-width CTA |

---

## Task 1: Flatten Radius + bump Spacing in theme

**Files:**
- Modify: `lib/theme.ts`

- [ ] **Step 1: Update Radius and Spacing exports**

In `lib/theme.ts`, replace the `Radius` and `Spacing` blocks with:

```typescript
export const Radius = {
  xs:   0,
  sm:   0,
  md:   4,
  lg:   4,
  xl:   4,
  xxl:  4,
  full: 9999,
};

export const Spacing = {
  xs:  4,
  sm:  12,
  md:  20,
  lg:  32,
  xl:  40,
  xxl: 56,
  container: 20,
  gutter: 16,
};
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd C:\Users\Agada\Documents\Quorum && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (radius/spacing are plain numbers — no type breakage).

- [ ] **Step 3: Commit**

```bash
git add lib/theme.ts
git commit -m "design: flatten Radius scale and bump Spacing for minimalist layout"
```

---

## Task 2: AnimatedButton — flat solid fill, sharp corners

**Files:**
- Modify: `components/AnimatedButton.tsx`

- [ ] **Step 1: Replace file content**

Replace the full content of `components/AnimatedButton.tsx` with:

```typescript
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'gold' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

export default function AnimatedButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  style,
  textStyle,
  disabled,
  loading,
  icon,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 80, bounciness: 3 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 55, bounciness: 12 }).start();

  const isDisabled = disabled || loading;

  const paddingV = size === 'sm' ? 10 : size === 'lg' ? 18 : 14;
  const paddingH = size === 'sm' ? 16 : size === 'lg' ? 28 : Spacing.lg;
  const fontSize = size === 'sm' ? FontSize.sm : size === 'lg' ? FontSize.lg : FontSize.md;

  const bgColor =
    variant === 'primary' ? Colors.primary :
    variant === 'gold'    ? Colors.gold :
    variant === 'danger'  ? Colors.tertiary :
    'transparent';

  const txtColor =
    variant === 'ghost'     ? Colors.primary :
    variant === 'secondary' ? Colors.text :
    '#ffffff';

  const borderColor =
    variant === 'ghost'     ? Colors.primaryBorder :
    variant === 'secondary' ? Colors.borderStrong :
    variant === 'danger'    ? Colors.tertiaryBorder :
    'transparent';

  const borderWidth =
    variant === 'ghost' || variant === 'secondary' || variant === 'danger' ? 1.5 : 0;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={isDisabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
    >
      <Animated.View
        style={[
          styles.button,
          {
            transform: [{ scale }],
            backgroundColor: bgColor,
            borderColor,
            borderWidth,
            paddingVertical: paddingV,
            paddingHorizontal: paddingH,
          },
          isDisabled && styles.disabled,
          style,
        ]}
      >
        <View style={styles.inner}>
          {loading ? (
            <ActivityIndicator size="small" color={txtColor} style={{ marginRight: 6 }} />
          ) : icon ? (
            <View style={{ marginRight: 6 }}>{icon}</View>
          ) : null}
          <Text style={[styles.label, { fontSize, color: txtColor, fontWeight: FontWeight.semibold }, textStyle]}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    letterSpacing: 0.3,
  },
  disabled: { opacity: 0.38 },
});
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AnimatedButton.tsx
git commit -m "design: AnimatedButton flat solid fill, sharp corners (Radius.md)"
```

---

## Task 3: GlassCard — flat card with border, no glass effect

**Files:**
- Modify: `components/GlassCard.tsx`

- [ ] **Step 1: Replace file content**

```typescript
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Colors, Radius } from '../lib/theme';

interface Props {
  children: React.ReactNode;
  index?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  glowColor?: string;
  noAnimate?: boolean;
}

export default function GlassCard({
  children,
  index = 0,
  onPress,
  onLongPress,
  style,
  glowColor,
  noAnimate = false,
}: Props) {
  const opacity = useRef(new Animated.Value(noAnimate ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(noAnimate ? 0 : 16)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (noAnimate) return;
    const delay = Math.min(index * 55, 220);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 100, friction: 14, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 80, bounciness: 2 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 12 }).start();

  const borderColor = glowColor ? glowColor + '40' : Colors.border;

  const inner = (
    <Animated.View
      style={[
        styles.card,
        { borderColor },
        style,
        { opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      {children}
    </Animated.View>
  );

  if (onPress || onLongPress) {
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/GlassCard.tsx
git commit -m "design: GlassCard flat border card, remove glass highlight and shadow"
```

---

## Task 4: AnimatedCard — flat, sharp, border only

**Files:**
- Modify: `components/AnimatedCard.tsx`

- [ ] **Step 1: Replace file content**

```typescript
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Colors, Radius } from '../lib/theme';

interface Props {
  children: React.ReactNode;
  index?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  accentColor?: string;
}

export default function AnimatedCard({ children, index = 0, onPress, onLongPress, style, accentColor }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay: index * 60, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 90, friction: 13, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 80, bounciness: 2 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 45, bounciness: 10 }).start();

  const accent = accentColor || Colors.primary;
  const isArchived = accentColor === Colors.textMuted;

  const content = (
    <Animated.View
      style={[
        styles.card,
        { borderColor: accent + '30' },
        isArchived && styles.cardArchived,
        style,
        { opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      <View style={[styles.topAccent, { backgroundColor: accent }]} />
      {children}
    </Animated.View>
  );

  if (onPress || onLongPress) {
    return (
      <TouchableOpacity activeOpacity={1} onPress={onPress} onLongPress={onLongPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardArchived: { opacity: 0.55 },
  topAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/AnimatedCard.tsx
git commit -m "design: AnimatedCard sharp corners, flat border, padding 20"
```

---

## Task 5: QuorumProgressBar — flat rectangular track

**Files:**
- Modify: `components/QuorumProgressBar.tsx`

- [ ] **Step 1: Change height to 6, borderRadius to 0**

In `components/QuorumProgressBar.tsx`, make these targeted edits:

Change the animated fill `<Animated.View>` height and borderRadius:
```typescript
// Old:
style={{
  height: 10,
  borderRadius: Radius.full,
  width: progress.interpolate({ inputRange: [0, 1], outputRange: ['3%', '100%'] }),
  overflow: 'hidden',
}}

// New:
style={{
  height: 6,
  borderRadius: 0,
  width: progress.interpolate({ inputRange: [0, 1], outputRange: ['2%', '100%'] }),
  overflow: 'hidden',
}}
```

Change the `track` style:
```typescript
// Old:
track: {
  height: 10,
  borderRadius: Radius.full,
  backgroundColor: Colors.surfaceOverlay,
  overflow: 'hidden',
  position: 'relative',
},

// New:
track: {
  height: 6,
  borderRadius: 0,
  backgroundColor: Colors.surfaceBright,
  overflow: 'hidden',
  position: 'relative',
},
```

Change the `glowLayer` borderRadius:
```typescript
// Old:
glowLayer: {
  ...StyleSheet.absoluteFillObject,
  borderRadius: Radius.full,
},

// New:
glowLayer: {
  ...StyleSheet.absoluteFillObject,
  borderRadius: 0,
},
```

- [ ] **Step 2: Commit**

```bash
git add components/QuorumProgressBar.tsx
git commit -m "design: QuorumProgressBar flat track, height 6px, no rounded ends"
```

---

## Task 6: CategoryPill — slight radius, larger padding

**Files:**
- Modify: `components/CategoryPill.tsx`

- [ ] **Step 1: Update pill styles**

In `components/CategoryPill.tsx`, replace the `styles` block:

```typescript
const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.container,
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  labelActive: {
    color: '#ffffff',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/CategoryPill.tsx
git commit -m "design: CategoryPill sharp radius, solid active fill, bumped padding"
```

---

## Task 7: Tab bar — white background, underline active state

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

- [ ] **Step 1: Update styles in `_layout.tsx`**

Replace the `styles` block at the bottom of `app/(tabs)/_layout.tsx`:

```typescript
const styles = StyleSheet.create({
  barWrap: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  topBorder: { height: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  iconWrap: {
    width: 46,
    height: 32,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderTopWidth: 2,
    borderTopColor: Colors.primary,
    borderWidth: 0,
  },
  tabLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 4,
    backgroundColor: Colors.tertiary,
    borderRadius: 99,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  createBtnWrap: {
    width: 60,
    alignItems: 'center',
    marginTop: -20,
  },
  createBtn: {
    width: 52,
    height: 52,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
});
```

Also update the icon color in `TabBtn` — active icon should be `Colors.primary` (black), not `Colors.primaryLight`:

```typescript
// In the <Ionicons> inside TabBtn, change:
color={isActive ? Colors.primaryLight : Colors.textMuted}
// To:
color={isActive ? Colors.primary : Colors.textMuted}
```

- [ ] **Step 2: Commit**

```bash
git add app/(tabs)/_layout.tsx
git commit -m "design: tab bar white bg, underline active state, square create button"
```

---

## Task 8: Home screen spacing and card styles

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Update `styles` block — header, sectionLabel, cards, search**

In `app/(tabs)/index.tsx` replace the relevant style entries (find each by name in the `styles` object):

```typescript
// Header
header: {
  paddingHorizontal: Spacing.container,
  paddingTop: Spacing.md,
  paddingBottom: Spacing.md,
  borderBottomWidth: 1,
  borderBottomColor: Colors.border,
},
headerRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: Spacing.md,
},
appTitle: {
  fontSize: FontSize.xl,
  fontWeight: FontWeight.black,
  color: Colors.text,
  letterSpacing: -0.6,
},
iconBtn: {
  width: 40,
  height: 40,
  borderRadius: Radius.md,
  backgroundColor: Colors.surfaceRaised,
  borderWidth: 1,
  borderColor: Colors.border,
  alignItems: 'center',
  justifyContent: 'center',
},
addBtn: {
  backgroundColor: Colors.primary,
  borderColor: Colors.primary,
},

// Section label — uppercase, bold, spacious
sectionLabel: {
  fontSize: 11,
  fontWeight: FontWeight.heavy,
  color: Colors.textMuted,
  paddingHorizontal: Spacing.container,
  marginBottom: Spacing.sm,
  marginTop: Spacing.lg,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
},

// Search bar — sharp
searchContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  marginHorizontal: Spacing.container,
  marginBottom: Spacing.sm,
  backgroundColor: Colors.backgroundAlt,
  borderRadius: Radius.md,
  borderWidth: 1,
  borderColor: Colors.border,
  paddingHorizontal: Spacing.md,
  paddingVertical: 2,
  gap: 8,
},

// Card body — more padding
cardBody: { padding: Spacing.md },

// Friend card — sharper
friendCard: {
  width: 172,
  minHeight: 120,
  marginBottom: 0,
  padding: Spacing.md,
},
```

- [ ] **Step 2: Update cover image height and radius**

Find `cardCover` or cover image styles in discover card and update:

In index.tsx, search for `height: 130` or the plan card cover image style and set height to `180`, borderRadius to `0`:

```typescript
// In plan card cover image style (look for coverImage in styles):
coverImage: {
  width: '100%',
  height: 180,
  borderRadius: 0,
},
```

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "design: Home screen spacing overhaul — section labels, card padding, cover height"
```

---

## Task 9: Profile screen — stats dividers, flat sections

**Files:**
- Modify: `app/(tabs)/profile.tsx`

- [ ] **Step 1: Find and update stats container and section styles**

In `app/(tabs)/profile.tsx`, find the `styles` block and update these entries:

```typescript
// Stats row — no card, just columns with dividers
statsContainer: {
  flexDirection: 'row',
  paddingVertical: Spacing.md,
  paddingHorizontal: Spacing.container,
  borderTopWidth: 1,
  borderBottomWidth: 1,
  borderColor: Colors.border,
  backgroundColor: Colors.backgroundAlt,
},
statDivider: {
  width: 1,
  backgroundColor: Colors.border,
  marginVertical: 4,
},

// Actions row — full bleed, no card
actionsRow: {
  flexDirection: 'row',
  paddingHorizontal: Spacing.container,
  paddingVertical: Spacing.md,
  gap: Spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: Colors.border,
},
actionBtn: { flex: 1 },

// Section titles — uppercase
sectionTitle: {
  fontSize: 11,
  fontWeight: FontWeight.heavy,
  color: Colors.textMuted,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  paddingHorizontal: Spacing.container,
  paddingTop: Spacing.lg,
  paddingBottom: Spacing.sm,
},

// Hero — remove gradient, clean layout
heroContainer: {
  alignItems: 'center',
  paddingTop: Spacing.lg,
  paddingBottom: Spacing.md,
  paddingHorizontal: Spacing.container,
  borderBottomWidth: 1,
  borderBottomColor: Colors.border,
  backgroundColor: Colors.backgroundAlt,
},
```

- [ ] **Step 2: Remove LinearGradient from hero section**

In the JSX, find the `<LinearGradient>` inside `heroContainer` and remove it entirely — the `heroContainer` background color handles the hero tint.

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/profile.tsx
git commit -m "design: Profile screen flat stats row, section dividers, no hero gradient"
```

---

## Task 10: Discover screen — sharp cards, cover height, flat chips

**Files:**
- Modify: `app/(tabs)/discover.tsx`

- [ ] **Step 1: Update styles block**

In `app/(tabs)/discover.tsx`, update these style entries:

```typescript
// Search bar
searchBar: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  backgroundColor: Colors.backgroundAlt,
  borderRadius: Radius.md,
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderWidth: 1,
  borderColor: Colors.border,
},

// Card body — more breathing room
cardBody: { padding: Spacing.md, gap: 10 },

// Cover image — sharp, taller
cardCover: {
  width: '100%',
  height: 180,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
},
cardCoverGradient: {
  width: '100%',
  height: 60,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
},

// Category pill — sharp
catPill: {
  paddingHorizontal: 10,
  paddingVertical: 3,
  borderRadius: Radius.md,
  backgroundColor: Colors.primaryDim,
  borderWidth: 1,
  borderColor: Colors.primaryBorder,
},

// Info chips — sharp
chip: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  backgroundColor: Colors.surfaceRaised,
  borderRadius: Radius.md,
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderWidth: 1,
  borderColor: Colors.border,
},

// Join button — sharp, full-width feel
joinBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  marginTop: 4,
  paddingVertical: 12,
  borderRadius: Radius.md,
  backgroundColor: Colors.primary,
  borderWidth: 0,
},
joinBtnJoined: {
  backgroundColor: Colors.secondaryDim,
  borderColor: Colors.secondaryBorder,
  borderWidth: 1,
},
joinBtnFull: {
  backgroundColor: Colors.surfaceRaised,
  borderColor: Colors.border,
  borderWidth: 1,
},
```

- [ ] **Step 2: Update join button text color**

Find the join button text styles and make sure joined/full states have correct text colors:

```typescript
joinBtnText: {
  fontSize: FontSize.sm,
  fontWeight: FontWeight.bold,
  color: '#ffffff',
},
joinBtnTextJoined: { color: Colors.secondary },
joinBtnTextFull: { color: Colors.textMuted },
```

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/discover.tsx
git commit -m "design: Discover screen sharp cards, taller covers, flat join button"
```

---

## Task 11: Plan Detail — underline tabs, flat location card, sharp CTA

**Files:**
- Modify: `app/plan-detail.tsx`

- [ ] **Step 1: Update tab bar styles to underline style**

In `app/plan-detail.tsx`, find and replace these styles:

```typescript
// Tabs bar — full-width, no padding gap
tabsBar: {
  flexDirection: 'row',
  borderBottomWidth: 1,
  borderBottomColor: Colors.border,
  paddingHorizontal: Spacing.container,
},

// Each tab — underline active
detailTab: {
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderBottomWidth: 2,
  borderBottomColor: 'transparent',
  marginBottom: -1,
},
detailTabActive: {
  borderBottomColor: Colors.primary,
},
detailTabLabel: {
  fontSize: FontSize.sm,
  fontWeight: FontWeight.semibold,
  color: Colors.textMuted,
},
detailTabLabelActive: {
  color: Colors.primary,
  fontWeight: FontWeight.bold,
},
```

- [ ] **Step 2: Update modal bottom sheet, location card, and CTA styles**

```typescript
// Modal — sharper top corners
modalContent: {
  backgroundColor: Colors.backgroundAlt,
  borderTopLeftRadius: Radius.lg,
  borderTopRightRadius: Radius.lg,
  padding: Spacing.lg,
  gap: Spacing.sm,
  paddingBottom: 40,
},

// Poll options — sharp
pollOption: {
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: Radius.md,
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: Colors.border,
  marginBottom: 8,
  height: 44,
  position: 'relative',
},

// Creator action buttons — sharp
editBtn: {
  flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
  backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border,
},
archiveBtn: {
  flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
  backgroundColor: Colors.goldDim, borderWidth: 1, borderColor: Colors.goldBorder,
},
deleteBtn: {
  flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
  backgroundColor: Colors.tertiaryDim, borderWidth: 1, borderColor: Colors.tertiaryBorder,
},
leaveBtn: {
  flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
  borderWidth: 1, borderColor: Colors.border,
},
calendarBtn: {
  marginTop: 8, paddingVertical: 12, alignItems: 'center', borderRadius: Radius.md,
  backgroundColor: Colors.successDim, borderWidth: 1, borderColor: Colors.secondaryBorder,
  flexDirection: 'row', justifyContent: 'center',
},

// Vote badge — sharp
votedBadge: {
  backgroundColor: Colors.successDim,
  paddingHorizontal: 8, paddingVertical: 3,
  borderRadius: Radius.md,
},

// Invite button — sharp
inviteBtn: {
  paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md,
  backgroundColor: Colors.primaryDim, borderWidth: 1, borderColor: Colors.primaryBorder,
},
```

- [ ] **Step 3: Also remove `gap: 8` from `tabsBar` if it exists (underline style uses row layout)**

Find `tabsBar` in the JSX and ensure it renders as a `<View style={styles.tabsBar}>` with `flexDirection: 'row'` — no ScrollView wrapping needed for 3 tabs.

- [ ] **Step 4: Commit**

```bash
git add app/plan-detail.tsx
git commit -m "design: Plan Detail underline tabs, sharp cards and modals, flat CTA"
```

---

## Task 12: Final cache clear and visual verification

- [ ] **Step 1: Kill any running node process**

```bash
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force; Write-Host 'done'"
```

- [ ] **Step 2: Start Expo with cache cleared**

```bash
cd C:\Users\Agada\Documents\Quorum && npx expo start --clear --android
```

- [ ] **Step 3: Verify each screen visually**

Check each screen against Stitch screenshots:
- [ ] Home: sharp cards, uppercase section labels, generous spacing
- [ ] Profile: flat stats row with dividers, section headings uppercase
- [ ] Discover: tall cover images (180px), sharp corners, solid black join button
- [ ] Plan Detail: underline tabs, flat location card
- [ ] Tab bar: white bg, black underline on active tab, square create button

- [ ] **Step 4: Update desktop reference file**

Update `C:\Users\Agada\Desktop\quorum-claude-reference.md` — mark spacing overhaul as complete.
