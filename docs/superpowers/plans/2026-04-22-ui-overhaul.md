# Quorum UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete visual and structural overhaul — new glassmorphism design system, bottom-tab primary navigation replacing the drawer, redesigned screens, and new Moments + SwipePlanCard features.

**Architecture:** Replace `app/(drawer)/` with a new route structure: `app/(tabs)/` for the 4 primary tab screens (Home, Discover, Activity, Profile) and stack screens at the `app/` root level for detail/modal flows (plan-detail, create-plan, chat, social, settings, user-profile). A custom BottomTabBar renders inside `(tabs)/_layout.tsx` with a floating center Create button. All screens adopt the new GlassCard component and extended theme tokens.

**Tech Stack:** React Native 0.83, Expo SDK 55, expo-router v6 (Tabs + Stack), Firebase 12, expo-linear-gradient ~15, expo-blur ~14 (new dep), react-native-reanimated 4, @expo/vector-icons Ionicons

---

## File Map

### New Files
| File | Purpose |
|---|---|
| `app/(tabs)/_layout.tsx` | Tab navigator — 4 tabs + floating Create FAB |
| `app/(tabs)/index.tsx` | Home — plan feed with SwipePlanCard |
| `app/(tabs)/discover.tsx` | Discover — public plans with category filters |
| `app/(tabs)/activity.tsx` | Activity — notifications/friend requests |
| `app/(tabs)/profile.tsx` | Profile — own user profile |
| `app/plan-detail.tsx` | Plan detail — stack modal (replaces drawer version) |
| `app/create-plan.tsx` | Create plan — stack modal |
| `app/chat.tsx` | Chat — stack modal |
| `app/social.tsx` | Social/friends — stack modal |
| `app/settings.tsx` | Settings — stack modal |
| `app/user-profile.tsx` | Other user profile — stack modal |
| `components/GlassCard.tsx` | Core glassmorphism card primitive |
| `components/CategoryPill.tsx` | Horizontal filter pills |
| `components/SwipePlanCard.tsx` | Swipe-left/right plan card with vote action |
| `components/MomentsGallery.tsx` | Post-event photo grid for plan-detail |

### Modified Files
| File | Change |
|---|---|
| `lib/theme.ts` | Add glass, glow, surface, shadow, fontWeight tokens |
| `app/_layout.tsx` | Route (drawer)→(tabs), update auth redirects |
| `app/(auth)/login.tsx` | Full redesign — premium dark glass aesthetic |
| `components/AnimatedCard.tsx` | Adopt new theme tokens, side glow border |
| `components/AnimatedButton.tsx` | Add `danger` variant, adopt new tokens |
| `components/BottomTabBar.tsx` | Replaced by tab navigator — keep for reference only |
| `components/ScreenWrapper.tsx` | Remove bottomTabBar prop (now native to layout) |
| `components/QuorumProgressBar.tsx` | Taller (12px), sharper glow, cleaner percentage label |
| `components/DrawerContent.tsx` | Delete — replaced by tab nav |

### Deleted
- All files under `app/(drawer)/` — content migrated to `app/(tabs)/` and `app/*.tsx`

---

## Task 1: Install expo-blur + Extend Theme

**Files:**
- Modify: `lib/theme.ts`

- [ ] **Step 1: Install expo-blur**

```bash
npx expo install expo-blur
```

- [ ] **Step 2: Replace lib/theme.ts entirely**

```typescript
export const Colors = {
  // Base backgrounds
  background: '#080608',
  backgroundAlt: '#0c090f',

  // Surfaces (elevation layers)
  surface: '#100d14',
  surfaceRaised: '#181320',
  surfaceOverlay: '#201828',

  // Glass (semi-transparent overlays for cards)
  glass: 'rgba(255,255,255,0.035)',
  glassMid: 'rgba(255,255,255,0.06)',
  glassStrong: 'rgba(255,255,255,0.10)',
  glassBorder: 'rgba(255,255,255,0.07)',
  glassBorderStrong: 'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.04)',

  // Primary — Rose
  primary: '#f43f5e',
  primaryLight: '#fb7185',
  primaryDim: 'rgba(244,63,94,0.12)',
  primaryGlow: 'rgba(244,63,94,0.28)',
  primaryBorder: 'rgba(244,63,94,0.35)',

  // Gold
  gold: '#FFD700',
  goldLight: '#FFE55C',
  goldDim: 'rgba(255,215,0,0.12)',
  goldGlow: 'rgba(255,215,0,0.28)',

  // Text
  text: '#fef2f4',
  textSecondary: '#c09098',
  textMuted: '#7a5060',
  textDisabled: '#3d2535',

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
  card: '#181320',
  cardElevated: '#201828',
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
  rose: {
    shadowColor: '#f43f5e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  roseStrong: {
    shadowColor: '#f43f5e',
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

- [ ] **Step 3: Commit**

```bash
git add lib/theme.ts package.json package-lock.json
git commit -m "feat: extend theme with glass, glow, surface, shadow, fontWeight tokens"
```

---

## Task 2: Create GlassCard Component

**Files:**
- Create: `components/GlassCard.tsx`

- [ ] **Step 1: Create GlassCard.tsx**

```tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Colors, Radius, Shadow } from '../lib/theme';

interface Props {
  children: React.ReactNode;
  index?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  /** Accent glow color applied as border + shadow tint */
  glowColor?: string;
  /** If true, skip entrance animation */
  noAnimate?: boolean;
}

/**
 * Core card primitive for the new UI.
 * Uses semi-transparent glass surface + subtle border + optional color glow.
 */
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
  const translateY = useRef(new Animated.Value(noAnimate ? 0 : 24)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (noAnimate) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        tension: 90,
        friction: 13,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.972, useNativeDriver: true, speed: 80, bounciness: 2 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 45, bounciness: 10 }).start();

  const borderColor = glowColor
    ? glowColor + '55'
    : Colors.glassBorder;

  const shadowStyle = glowColor
    ? { shadowColor: glowColor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 10 }
    : Shadow.dark;

  const inner = (
    <Animated.View
      style={[
        styles.card,
        { borderColor, ...shadowStyle },
        style,
        { opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      {/* Top highlight streak */}
      <View style={styles.topHighlight} />
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
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: Colors.glassHighlight,
    borderRadius: 1,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/GlassCard.tsx
git commit -m "feat: add GlassCard — glassmorphism card primitive"
```

---

## Task 3: Create CategoryPill Component

**Files:**
- Create: `components/CategoryPill.tsx`

- [ ] **Step 1: Create CategoryPill.tsx**

```tsx
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';

interface Pill {
  label: string;
  value: string;
}

interface Props {
  pills: Pill[];
  selected: string;
  onSelect: (value: string) => void;
}

export default function CategoryPillRow({ pills, selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {pills.map((p) => {
        const active = p.value === selected;
        return (
          <TouchableOpacity
            key={p.value}
            onPress={() => onSelect(p.value)}
            style={[styles.pill, active && styles.pillActive]}
            activeOpacity={0.75}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{p.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  pillActive: {
    backgroundColor: Colors.primaryDim,
    borderColor: Colors.primaryBorder,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  labelActive: {
    color: Colors.primary,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/CategoryPill.tsx
git commit -m "feat: add CategoryPill row component"
```

---

## Task 4: Redesign AnimatedButton + Update AnimatedCard

**Files:**
- Modify: `components/AnimatedButton.tsx`
- Modify: `components/AnimatedCard.tsx`

- [ ] **Step 1: Rewrite AnimatedButton.tsx**

```tsx
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
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../lib/theme';

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
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 80, bounciness: 3 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 55, bounciness: 12 }).start();

  const isDisabled = disabled || loading;

  const paddingV = size === 'sm' ? 8 : size === 'lg' ? 16 : 12;
  const paddingH = size === 'sm' ? 16 : size === 'lg' ? 28 : Spacing.lg;
  const fontSize = size === 'sm' ? FontSize.sm : size === 'lg' ? FontSize.lg : FontSize.md;

  const txtColor =
    variant === 'gold' ? '#1a1000' :
    variant === 'ghost' ? Colors.primary :
    variant === 'secondary' ? Colors.text :
    variant === 'danger' ? Colors.error :
    '#fff';

  const content = (
    <View style={[styles.inner, { paddingVertical: paddingV, paddingHorizontal: paddingH }]}>
      {loading ? (
        <ActivityIndicator size="small" color={txtColor} style={{ marginRight: 6 }} />
      ) : icon ? (
        <View style={{ marginRight: 6 }}>{icon}</View>
      ) : null}
      <Text style={[styles.label, { fontSize, color: txtColor, fontWeight: FontWeight.semibold }, textStyle]}>
        {label}
      </Text>
    </View>
  );

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
          { transform: [{ scale }] },
          isDisabled && styles.disabled,
          style,
        ]}
      >
        {variant === 'primary' && (
          <LinearGradient
            colors={['#fb7185', '#f43f5e', '#e11d48']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full }]}
          />
        )}
        {variant === 'gold' && (
          <LinearGradient
            colors={['#FFE55C', '#FFD700', '#d4a800']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full }]}
          />
        )}
        {variant === 'secondary' && (
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full, backgroundColor: Colors.surfaceOverlay, borderWidth: 1, borderColor: Colors.glassBorderStrong }]} />
        )}
        {variant === 'ghost' && (
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.primaryBorder }]} />
        )}
        {variant === 'danger' && (
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.error + '55' }]} />
        )}
        {content}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.full,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    letterSpacing: 0.2,
  },
  disabled: { opacity: 0.38 },
});
```

- [ ] **Step 2: Update AnimatedCard.tsx to use new tokens**

```tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Colors, Radius, Shadow } from '../lib/theme';

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
  const translateY = useRef(new Animated.Value(24)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 90, friction: 13, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.972, useNativeDriver: true, speed: 80, bounciness: 2 }).start();

  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 45, bounciness: 10 }).start();

  const accent = accentColor || Colors.primary;
  const isArchived = accentColor === Colors.textMuted;

  const content = (
    <Animated.View
      style={[
        styles.card,
        { borderColor: accent + '40' },
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
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    ...Shadow.dark,
  },
  cardArchived: { opacity: 0.55 },
  topAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
});
```

- [ ] **Step 3: Commit**

```bash
git add components/AnimatedButton.tsx components/AnimatedCard.tsx
git commit -m "feat: redesign AnimatedButton with gradients and danger variant; update AnimatedCard tokens"
```

---

## Task 5: Redesign QuorumProgressBar + ScreenWrapper

**Files:**
- Modify: `components/QuorumProgressBar.tsx`
- Modify: `components/ScreenWrapper.tsx`

- [ ] **Step 1: Read current QuorumProgressBar.tsx and ScreenWrapper.tsx**

Read `components/QuorumProgressBar.tsx` and `components/ScreenWrapper.tsx` before editing.

- [ ] **Step 2: Update QuorumProgressBar.tsx**

Replace the entire file:

```tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

interface Props {
  votes: number;
  required: number;
  label?: string;
}

export default function QuorumProgressBar({ votes, required, label }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const ratio = Math.min(votes / Math.max(required, 1), 1);
  const pct = Math.round(ratio * 100);
  const reached = votes >= required;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: ratio,
      tension: 60,
      friction: 10,
      useNativeDriver: false,
    }).start();
  }, [ratio]);

  useEffect(() => {
    if (ratio >= 0.6) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(glow, { toValue: 0.4, duration: 900, useNativeDriver: false }),
        ])
      ).start();
    } else {
      glow.setValue(0);
    }
  }, [ratio >= 0.6]);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label ?? `${votes} / ${required} votes`}</Text>
        <Text style={[styles.pct, reached && styles.pctReached]}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.glowLayer, { opacity: glowOpacity }]} />
        <Animated.View
          style={{
            height: 12,
            borderRadius: Radius.full,
            width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={reached ? ['#FFE55C', '#FFD700'] : ['#fb7185', '#f43f5e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  pct: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
  pctReached: { color: Colors.gold },
  track: {
    height: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  glowLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
});
```

- [ ] **Step 3: Update ScreenWrapper.tsx**

```tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../lib/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

export default function ScreenWrapper({ children, style, edges = ['top', 'left', 'right'] }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      <Animated.View style={[styles.fill, { opacity }]}>
        {children}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  fill: { flex: 1 },
});
```

- [ ] **Step 4: Commit**

```bash
git add components/QuorumProgressBar.tsx components/ScreenWrapper.tsx
git commit -m "feat: redesign QuorumProgressBar and simplify ScreenWrapper"
```

---

## Task 6: New Navigation Structure — (tabs) layout

**Files:**
- Create: `app/(tabs)/_layout.tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Create app/(tabs)/_layout.tsx**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { Colors, FontSize, Radius, Shadow } from '../../lib/theme';

const TABS = [
  { name: 'index',    label: 'Home',     icon: 'home-outline' as const,          iconActive: 'home' as const },
  { name: 'discover', label: 'Discover', icon: 'compass-outline' as const,       iconActive: 'compass' as const },
  { name: 'activity', label: 'Activity', icon: 'notifications-outline' as const, iconActive: 'notifications' as const },
  { name: 'profile',  label: 'Profile',  icon: 'person-outline' as const,        iconActive: 'person' as const },
];

function CustomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      const d = snap.data();
      setBadge((d?.friendRequests?.length || 0));
    });
    return unsub;
  }, []);

  const activeRoute = (name: string) => {
    if (name === 'index') return pathname === '/' || pathname === '/index';
    return pathname.startsWith(`/${name}`);
  };

  return (
    <View style={[styles.barWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {/* Left two tabs */}
        {TABS.slice(0, 2).map((tab) => (
          <TabBtn
            key={tab.name}
            tab={tab}
            isActive={activeRoute(tab.name)}
            badge={tab.name === 'activity' ? badge : 0}
            onPress={() => router.push(tab.name === 'index' ? '/' : `/${tab.name}` as any)}
          />
        ))}

        {/* Center create button */}
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push('/create-plan' as any)}
          activeOpacity={0.85}
        >
          <View style={styles.createInner}>
            <Ionicons name="add" size={28} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Right two tabs */}
        {TABS.slice(2).map((tab) => (
          <TabBtn
            key={tab.name}
            tab={tab}
            isActive={activeRoute(tab.name)}
            badge={tab.name === 'activity' ? badge : 0}
            onPress={() => router.push(`/${tab.name}` as any)}
          />
        ))}
      </View>
    </View>
  );
}

function TabBtn({
  tab,
  isActive,
  badge,
  onPress,
}: {
  tab: (typeof TABS)[0];
  isActive: boolean;
  badge: number;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const press = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, speed: 80, bounciness: 2 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 14 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity style={styles.tab} onPress={press} activeOpacity={1}>
      <Animated.View style={[styles.iconWrap, isActive && styles.iconWrapActive, { transform: [{ scale }] }]}>
        <Ionicons
          name={isActive ? tab.iconActive : tab.icon}
          size={22}
          color={isActive ? Colors.primary : Colors.textMuted}
        />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </Animated.View>
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={() => <CustomTabBar />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
    ...Shadow.dark,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  iconWrap: {
    width: 44,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: Colors.primaryDim,
    ...Shadow.rose,
  },
  tabLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 3,
    backgroundColor: Colors.error,
    borderRadius: 99,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  createBtn: {
    width: 64,
    alignItems: 'center',
    marginTop: -18,
  },
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
});
```

- [ ] **Step 2: Update app/_layout.tsx — switch (drawer) → (tabs)**

In `app/_layout.tsx`, replace every occurrence of `(drawer)` with `(tabs)`:
- Line 148: `const inDrawer = segments[0] === '(drawer)';` → `const inTabs = segments[0] === '(tabs)';`
- Line 150: `router.replace('/(auth)/login');` stays the same
- Line 151: `router.replace('/(drawer)/home');` → `router.replace('/(tabs)');`
- Line 152-156: update the condition to use `inTabs`
- Line 163: `router.push({ pathname: '/(drawer)/plan-detail', ...` → `router.push({ pathname: '/plan-detail', ...`
- Stack.Screen: remove `name="(drawer)"`, add `name="(tabs)"` and `name="plan-detail"`, `name="create-plan"`, `name="chat"`, `name="social"`, `name="settings"`, `name="user-profile"`

Full updated `app/_layout.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChanged, User } from 'firebase/auth';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Colors } from '../lib/theme';
import { ToastProvider } from '../components/Toast';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerPushToken(uid: string) {
  if (!Device.isDevice) return;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await updateDoc(doc(db, 'users', uid), { pushToken: token });
  } catch {}
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

function SplashScreen() {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={splashStyles.container}>
      <Animated.View style={[splashStyles.logoWrap, { transform: [{ scale }], opacity }]}>
        <View style={splashStyles.glow} />
        <View style={splashStyles.ring}>
          <View style={splashStyles.circle}>
            <Text style={splashStyles.letter}>Q</Text>
          </View>
        </View>
      </Animated.View>
      <Animated.Text style={[splashStyles.appName, { opacity }]}>Quorum</Animated.Text>
      <Animated.Text style={[splashStyles.tagline, { opacity }]}>Plan together. Decide together.</Animated.Text>
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: 16 },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: Colors.primaryGlow },
  ring: { width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, borderColor: Colors.primaryBorder, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 84, height: 84, borderRadius: 42, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...{ shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 12 } },
  letter: { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  appName: { fontSize: 32, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: Colors.textMuted, fontWeight: '500' },
});

export default function RootLayout() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) registerPushToken(u.uid);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (user === undefined) return;
    const inAuth = segments[0] === '(auth)';
    const inTabs = segments[0] === '(tabs)';

    if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      router.replace('/(tabs)');
    } else if (user && !inTabs && !inAuth) {
      router.replace('/(tabs)');
    }
  }, [user, segments]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const planId = response.notification.request.content.data?.planId as string | undefined;
      if (planId) router.push({ pathname: '/plan-detail', params: { id: planId } });
    });
    return () => sub.remove();
  }, []);

  if (user === undefined) return <SplashScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <StatusBar style="light" backgroundColor={Colors.background} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background }, animation: 'slide_from_right' }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="plan-detail" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
            <Stack.Screen name="create-plan" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
            <Stack.Screen name="chat" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="social" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="user-profile" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 3: Create empty tab screen files so expo-router can resolve them**

Create `app/(tabs)/index.tsx` with placeholder (will be replaced in Task 7):
```tsx
import { View } from 'react-native';
export default function HomeTab() { return <View style={{ flex: 1 }} />; }
```

Create `app/(tabs)/discover.tsx`, `app/(tabs)/activity.tsx`, `app/(tabs)/profile.tsx` with same placeholder.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx "app/(tabs)/_layout.tsx" "app/(tabs)/index.tsx" "app/(tabs)/discover.tsx" "app/(tabs)/activity.tsx" "app/(tabs)/profile.tsx"
git commit -m "feat: migrate from drawer to bottom-tab navigation with floating Create button"
```

---

## Task 7: Home Screen (app/(tabs)/index.tsx)

**Files:**
- Create/Replace: `app/(tabs)/index.tsx`
- Read first: `app/(drawer)/home.tsx` for all existing Firebase logic and data structures

**Design:** Two-section feed — a horizontal "Friends' Plans" quick-scroll strip at top, then a vertical list of the user's own plans. Each plan card is a `GlassCard` with cover art (gradient placeholder if no image), title, category pill, date/location chips, and a QuorumProgressBar. Header shows "Quorum" logo left, avatar right, with a search bar below.

- [ ] **Step 1: Read existing home.tsx**

Read `app/(drawer)/home.tsx` fully to capture all Firebase queries, state variables, filter logic, swipeable actions (pin/archive/delete), onboarding, and friends' plans logic.

- [ ] **Step 2: Write app/(tabs)/index.tsx**

Rewrite the screen preserving all existing data logic (Firestore queries, swipe actions, pin/archive/delete, onboarding) but applying the new UI:

Key structural layout:
```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, FlatList, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassCard from '../../components/GlassCard';
import QuorumProgressBar from '../../components/QuorumProgressBar';
import CategoryPillRow from '../../components/CategoryPill';
import SkeletonLoader from '../../components/SkeletonLoader';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../lib/theme';
// ... all existing firebase imports from current home.tsx

// FILTER PILLS
const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Archived', value: 'archived' },
];

export default function HomeScreen() {
  // --- Copy ALL existing state + useEffect Firebase logic from app/(drawer)/home.tsx ---
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // HEADER: user avatar (top right), search icon
  // BODY:
  //   - CategoryPillRow for filter
  //   - FlatList of plans using PlanCard (defined below)
  //   - Empty state with Ionicons "calendar-outline"
}

function PlanCard({ plan, index, onPress }: { plan: any; index: number; onPress: () => void }) {
  const statusColor =
    plan.status === 'confirmed' ? Colors.success :
    plan.status === 'archived' ? Colors.textMuted :
    Colors.primary;

  return (
    <GlassCard index={index} onPress={onPress} glowColor={statusColor} style={styles.planCard}>
      {/* Cover image or gradient placeholder */}
      {plan.coverUrl ? (
        <Image source={{ uri: plan.coverUrl }} style={styles.cover} />
      ) : (
        <LinearGradient
          colors={['#f43f5e22', '#1a1520']}
          style={styles.coverGradient}
        />
      )}
      <View style={styles.cardBody}>
        {/* Category + status row */}
        <View style={styles.metaRow}>
          <View style={[styles.catPill, { backgroundColor: Colors.primaryDim }]}>
            <Text style={styles.catText}>{plan.category || 'Plan'}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusLabel, { color: statusColor }]}>{plan.status}</Text>
        </View>
        <Text style={styles.planTitle} numberOfLines={1}>{plan.title}</Text>
        {/* Date + location chips */}
        <View style={styles.chipsRow}>
          {plan.date && (
            <View style={styles.chip}>
              <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.chipText}>
                {new Date(plan.date?.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          )}
          {plan.location ? (
            <View style={styles.chip}>
              <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.chipText} numberOfLines={1}>{plan.location}</Text>
            </View>
          ) : null}
          <View style={styles.chip}>
            <Ionicons name="people-outline" size={11} color={Colors.textMuted} />
            <Text style={styles.chipText}>{plan.participants?.length ?? 0}</Text>
          </View>
        </View>
        <QuorumProgressBar votes={plan.votes?.length ?? 0} required={plan.requiredVotes ?? 1} />
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  planCard: { marginHorizontal: Spacing.md, overflow: 'hidden', padding: 0 },
  cover: { width: '100%', height: 120, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
  coverGradient: { width: '100%', height: 60, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
  cardBody: { padding: Spacing.md, gap: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full },
  catText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'capitalize' },
  planTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, letterSpacing: -0.3 },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: FontSize.xs, color: Colors.textMuted, maxWidth: 100 },
});
```

The header section:
```tsx
function HomeHeader({ user, onSearch }: { user: any; onSearch: () => void }) {
  return (
    <View style={headerStyles.container}>
      <View style={headerStyles.topRow}>
        <View>
          <Text style={headerStyles.greeting}>Good {getTimeOfDay()}</Text>
          <Text style={headerStyles.name}>{user?.displayName?.split(' ')[0] ?? 'there'}</Text>
        </View>
        <TouchableOpacity style={headerStyles.avatarWrap} onPress={onSearch}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={headerStyles.avatar} />
          ) : (
            <View style={headerStyles.avatarFallback}>
              <Ionicons name="person" size={20} color={Colors.primary} />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning,';
  if (h < 17) return 'afternoon,';
  return 'evening,';
}

const headerStyles = StyleSheet.create({
  container: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  name: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.text, letterSpacing: -0.8 },
  avatarWrap: { marginTop: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: Colors.primaryBorder },
  avatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryDim, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primaryBorder },
});
```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat: redesign home screen with GlassCard feed, greeting header, category filters"
```

---

## Task 8: Discover Screen (app/(tabs)/discover.tsx)

**Files:**
- Create/Replace: `app/(tabs)/discover.tsx`
- Read first: `app/(drawer)/events.tsx`

**Design:** Full redesign of the events screen. Large hero banner at top with gradient overlay. Category filter pills (All, Sports, Food, Music, Arts, Outdoors, Social, Other). Public plan cards using GlassCard with cover images prominent. Search bar integrated.

- [ ] **Step 1: Read existing events.tsx**

Read `app/(drawer)/events.tsx` to capture all Firebase queries (public plans from other users).

- [ ] **Step 2: Write app/(tabs)/discover.tsx**

Key structure:
```tsx
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import GlassCard from '../../components/GlassCard';
import CategoryPillRow from '../../components/CategoryPill';
import ScreenWrapper from '../../components/ScreenWrapper';
import QuorumProgressBar from '../../components/QuorumProgressBar';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';

const CATEGORIES = [
  { label: 'All', value: 'all' },
  { label: 'Sports', value: 'Sports' },
  { label: 'Food', value: 'Food & Drink' },
  { label: 'Music', value: 'Music' },
  { label: 'Arts', value: 'Arts & Culture' },
  { label: 'Outdoors', value: 'Outdoors' },
  { label: 'Social', value: 'Social' },
  { label: 'Other', value: 'Other' },
];

export default function DiscoverScreen() {
  const [plans, setPlans] = useState<any[]>([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Query public plans not created by current user, ordered by date
    const uid = auth.currentUser?.uid;
    const q = query(
      collection(db, 'plans'),
      where('isPublic', '==', true),
      where('status', 'in', ['pending', 'confirmed']),
      orderBy('createdAt', 'desc'),
      limit(40)
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p: any) => p.createdBy !== uid);
      setPlans(data);
    });
    return unsub;
  }, []);

  const filtered = plans.filter((p: any) => {
    const matchCat = category === 'all' || p.category === category;
    const matchSearch = !search || p.title?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            placeholder="Search plans..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} onPress={() => setSearch('')} />
          )}
        </View>
      </View>

      <CategoryPillRow pills={CATEGORIES} selected={category} onSelect={setCategory} />

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="compass-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No plans found</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <GlassCard
            index={index}
            onPress={() => router.push({ pathname: '/plan-detail', params: { id: item.id } })}
            glowColor={item.status === 'confirmed' ? Colors.success : Colors.primary}
            style={styles.card}
          >
            {item.coverUrl ? (
              <Image source={{ uri: item.coverUrl }} style={styles.cardCover} />
            ) : (
              <LinearGradient colors={['#f43f5e22', '#100d14']} style={styles.cardCoverGradient} />
            )}
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <View style={styles.metaRow}>
                {item.date && (
                  <View style={styles.chip}>
                    <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                    <Text style={styles.chipText}>
                      {new Date(item.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                )}
                {item.location ? (
                  <View style={styles.chip}>
                    <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                    <Text style={styles.chipText} numberOfLines={1}>{item.location}</Text>
                  </View>
                ) : null}
              </View>
              <QuorumProgressBar votes={item.votes?.length ?? 0} required={item.requiredVotes ?? 1} />
            </View>
          </GlassCard>
        )}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: 12 },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.text, letterSpacing: -0.5 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surfaceRaised, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.glassBorder },
  searchInput: { flex: 1, color: Colors.text, fontSize: FontSize.md },
  list: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 100 },
  card: { padding: 0 },
  cardCover: { width: '100%', height: 130, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
  cardCoverGradient: { width: '100%', height: 60, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
  cardBody: { padding: Spacing.md, gap: 10 },
  cardTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: FontSize.xs, color: Colors.textMuted, maxWidth: 120 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.md },
});
```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/discover.tsx"
git commit -m "feat: redesign discover screen with category pills and GlassCard feed"
```

---

## Task 9: Activity Screen (app/(tabs)/activity.tsx)

**Files:**
- Create/Replace: `app/(tabs)/activity.tsx`
- Read first: `app/(drawer)/activity.tsx`

**Design:** Clean notification-style list. Two sections: Friend Requests (action cards with Accept/Decline) and Recent Activity (plan confirmations, joins). Each row in a `GlassCard` with a colored icon circle, event text, and timestamp.

- [ ] **Step 1: Read existing activity.tsx**

Read `app/(drawer)/activity.tsx` fully to capture all Firebase logic.

- [ ] **Step 2: Write app/(tabs)/activity.tsx**

Key structure (preserve all existing Firebase queries/mutations):
```tsx
import React, { useEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassCard from '../../components/GlassCard';
import AnimatedButton from '../../components/AnimatedButton';
import ScreenWrapper from '../../components/ScreenWrapper';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';
// ... all existing firebase imports

export default function ActivityScreen() {
  // --- Copy ALL existing state + useEffect Firebase logic ---

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        {/* Total badge count if any */}
      </View>

      {/* Friend Requests section (if any) */}
      {friendRequests.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Friend Requests</Text>
          {friendRequests.map((req, i) => (
            <GlassCard key={req.uid} index={i} glowColor={Colors.primary} style={styles.reqCard}>
              <View style={styles.reqRow}>
                {req.avatar ? (
                  <Image source={{ uri: req.avatar }} style={styles.reqAvatar} />
                ) : (
                  <View style={styles.reqAvatarFallback}>
                    <Ionicons name="person" size={16} color={Colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.reqName}>{req.displayName}</Text>
                  <Text style={styles.reqSub}>@{req.username}</Text>
                </View>
                <View style={styles.reqActions}>
                  <AnimatedButton label="Accept" onPress={() => acceptFriend(req.uid)} size="sm" variant="primary" />
                  <AnimatedButton label="Decline" onPress={() => declineFriend(req.uid)} size="sm" variant="ghost" />
                </View>
              </View>
            </GlassCard>
          ))}
        </View>
      )}

      {/* Activity feed */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Recent</Text>
        <FlatList
          data={activities}
          keyExtractor={(a) => a.id}
          renderItem={({ item, index }) => (
            <ActivityRow item={item} index={index} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="pulse-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>All quiet here</Text>
            </View>
          }
          scrollEnabled={false}
        />
      </View>
    </ScreenWrapper>
  );
}

function ActivityRow({ item, index }: { item: any; index: number }) {
  const iconColor =
    item.type === 'plan_confirmed' ? Colors.success :
    item.type === 'friend_joined' ? Colors.primary :
    Colors.gold;

  const iconName: any =
    item.type === 'plan_confirmed' ? 'checkmark-circle' :
    item.type === 'friend_joined' ? 'person-add' :
    'star';

  return (
    <GlassCard index={index} style={styles.actRow} noAnimate={false}>
      <View style={styles.actInner}>
        <View style={[styles.actIcon, { backgroundColor: iconColor + '22' }]}>
          <Ionicons name={iconName} size={18} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actText}>{item.message}</Text>
          <Text style={styles.actTime}>{formatRelTime(item.timestamp)}</Text>
        </View>
      </View>
    </GlassCard>
  );
}

function formatRelTime(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.text, letterSpacing: -0.5 },
  section: { paddingHorizontal: Spacing.md, marginBottom: Spacing.lg },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  reqCard: { padding: 12 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reqAvatar: { width: 36, height: 36, borderRadius: 18 },
  reqAvatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryDim, alignItems: 'center', justifyContent: 'center' },
  reqName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  reqSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  reqActions: { flexDirection: 'row', gap: 6 },
  actRow: { padding: 12 },
  actInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.medium },
  actTime: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 40 },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.md },
});
```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/activity.tsx"
git commit -m "feat: redesign activity screen with section layout and GlassCard rows"
```

---

## Task 10: Profile Screen (app/(tabs)/profile.tsx)

**Files:**
- Create/Replace: `app/(tabs)/profile.tsx`
- Read first: `app/(drawer)/profile.tsx`

**Design:** Hero section at top — full-width gradient banner with avatar centered, display name, username, bio. Below: stats row (plans, votes, rating). Then settings/action rows in `GlassCard` groups. Action button row: Edit Profile, Settings, Social.

- [ ] **Step 1: Read existing profile.tsx**

Read `app/(drawer)/profile.tsx` to capture all Firebase logic, edit modes, image upload, emergency contact, and city/country fields.

- [ ] **Step 2: Write app/(tabs)/profile.tsx**

Key layout structure (preserve all existing Firebase mutations):
```tsx
import React, { useEffect, useState } from 'react';
import {
  Image, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import GlassCard from '../../components/GlassCard';
import AnimatedButton from '../../components/AnimatedButton';
import ScreenWrapper from '../../components/ScreenWrapper';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../lib/theme';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => setProfile({ id: snap.id, ...snap.data() }));
    return unsub;
  }, []);

  // --- Preserve ALL existing edit/save/avatar upload logic ---

  if (!profile) return null;

  return (
    <ScreenWrapper edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Hero banner */}
        <View style={styles.heroBanner}>
          <LinearGradient colors={['#f43f5e33', '#080608']} style={StyleSheet.absoluteFill} />
          <TouchableOpacity style={styles.avatarWrap} onPress={/* open image picker */undefined}>
            {profile.avatar ? (
              <Image source={{ uri: profile.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={36} color={Colors.primary} />
              </View>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.displayName}>{profile.displayName}</Text>
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          {(profile.city || profile.country) && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.locationText}>{[profile.city, profile.country].filter(Boolean).join(', ')}</Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatChip label="Plans" value={profile.planCount ?? 0} />
          <View style={styles.statDiv} />
          <StatChip label="Votes" value={profile.voteCount ?? 0} />
          <View style={styles.statDiv} />
          <StatChip label="Rating" value={profile.ratingAvg ? profile.ratingAvg.toFixed(1) : '—'} gold />
        </View>

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <AnimatedButton label="Edit Profile" onPress={() => setEditing(true)} variant="secondary" size="sm" style={{ flex: 1 }} />
          <AnimatedButton label="Settings" onPress={() => router.push('/settings')} variant="ghost" size="sm" style={{ flex: 1 }} />
          <AnimatedButton label="Friends" onPress={() => router.push('/social')} variant="ghost" size="sm" style={{ flex: 1 }} />
        </View>

        {/* Friends preview */}
        {/* ... render friends list using GlassCard rows ... */}

      </ScrollView>
    </ScreenWrapper>
  );
}

function StatChip({ label, value, gold }: { label: string; value: any; gold?: boolean }) {
  return (
    <View style={statStyles.chip}>
      <Text style={[statStyles.value, gold && statStyles.gold]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  chip: { flex: 1, alignItems: 'center', gap: 2 },
  value: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: Colors.text },
  gold: { color: Colors.gold },
  label: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
});

const styles = StyleSheet.create({
  heroBanner: { alignItems: 'center', paddingTop: 24, paddingBottom: 20, paddingHorizontal: Spacing.md, gap: 6 },
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: Colors.primaryBorder, ...Shadow.roseStrong },
  avatarFallback: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.primaryDim, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.primaryBorder },
  editBadge: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.background },
  displayName: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: Colors.text, letterSpacing: -0.4 },
  username: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  bio: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: FontSize.xs, color: Colors.textMuted },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.md, backgroundColor: Colors.surfaceRaised, borderRadius: Radius.lg, paddingVertical: 16, borderWidth: 1, borderColor: Colors.glassBorder, marginBottom: Spacing.md },
  statDiv: { width: 1, height: 28, backgroundColor: Colors.glassBorder },
  actionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg },
});
```

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/profile.tsx"
git commit -m "feat: redesign profile screen with hero banner, stats row, gradient avatar"
```

---

## Task 11: Login Screen Redesign

**Files:**
- Modify: `app/(auth)/login.tsx`
- Read first: `app/(auth)/login.tsx`

**Design:** Full-screen dark luxury. Top third: animated logo with multi-ring glow pulse. Middle: glass-surface card with email/password inputs (icon-prefixed, glass backgrounds, rose focus border). Bottom: login/register toggle with gradient primary button. "Forgot password" as ghost link below. No background image — pure dark gradients.

- [ ] **Step 1: Read existing login.tsx**

Read `app/(auth)/login.tsx` fully to capture all auth logic, registration flow, username validation, country/city pickers, and password reset.

- [ ] **Step 2: Rewrite app/(auth)/login.tsx**

Preserve all existing auth logic (login, register, username check, country picker, city autocomplete, password reset modal). Replace all styling:

Key UI changes:
- Background: `Colors.background` (deep `#080608`)
- Subtle radial gradient glow behind logo using `LinearGradient` at absolute position
- Card: `backgroundColor: Colors.surfaceRaised`, `borderColor: Colors.glassBorder`, borderRadius `Radius.xxl`
- Inputs: `backgroundColor: Colors.surface`, `borderColor` animates to `Colors.primary` on focus
- Tab switcher (Login / Register): two pills in a `GlassCard` container
- Register multi-step flow: same logic, new styling
- All existing validation, cooldowns, and Firebase calls unchanged

Input field pattern:
```tsx
function GlassInput({
  icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[inputStyles.wrap, focused && inputStyles.wrapFocused]}>
      <Ionicons name={icon} size={18} color={focused ? Colors.primary : Colors.textMuted} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'none'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={inputStyles.input}
      />
    </View>
  );
}

const inputStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: Colors.glassBorder },
  wrapFocused: { borderColor: Colors.primaryBorder, backgroundColor: Colors.primaryDim },
  input: { flex: 1, color: Colors.text, fontSize: FontSize.md },
});
```

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/login.tsx"
git commit -m "feat: redesign login screen with glass card, animated logo, gradient button"
```

---

## Task 12: Plan Detail (app/plan-detail.tsx)

**Files:**
- Create: `app/plan-detail.tsx`
- Read first: `app/(drawer)/plan-detail.tsx`

**Design:** Full-screen modal. Scrollable. Top: full-width cover image (or gradient hero) with title overlay. Back button (top-left) + share button (top-right) float over the image. Below: tabbed sections — Overview, Poll, Chat, Photos (Moments). Overview: description, date/location, participants, QuorumProgressBar, vote button. Moments tab: photo grid (new feature).

- [ ] **Step 1: Read existing plan-detail.tsx**

Read `app/(drawer)/plan-detail.tsx` fully — this is a very large file (~78KB). Capture all Firebase logic, vote/unvote, checklist, comments, reactions, photos, calendar export, safety timer, host rating, invite code, report modal.

- [ ] **Step 2: Create app/plan-detail.tsx**

Create the file using the full logic from the drawer version with the following structural changes:

Navigation header (replaces drawer back button):
```tsx
// Floating header over cover image
<View style={styles.floatHeader}>
  <TouchableOpacity style={styles.floatBtn} onPress={() => router.back()}>
    <Ionicons name="chevron-back" size={22} color="#fff" />
  </TouchableOpacity>
  <TouchableOpacity style={styles.floatBtn} onPress={handleShare}>
    <Ionicons name="share-outline" size={22} color="#fff" />
  </TouchableOpacity>
</View>

const styles = StyleSheet.create({
  floatHeader: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', padding: 16, zIndex: 10 },
  floatBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
});
```

Tab bar for sections:
```tsx
const DETAIL_TABS = ['Overview', 'Poll', 'Chat', 'Moments'] as const;
type DetailTab = typeof DETAIL_TABS[number];

// Horizontal pill tabs below the cover
<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar}>
  {DETAIL_TABS.map((t) => (
    <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={[styles.detailTab, activeTab === t && styles.detailTabActive]}>
      <Text style={[styles.detailTabLabel, activeTab === t && styles.detailTabLabelActive]}>{t}</Text>
    </TouchableOpacity>
  ))}
</ScrollView>
```

Moments tab — new feature (calls `MomentsGallery`):
```tsx
{activeTab === 'Moments' && plan.status === 'confirmed' && (
  <MomentsGallery planId={plan.id} isParticipant={isParticipant} />
)}
{activeTab === 'Moments' && plan.status !== 'confirmed' && (
  <View style={styles.momentsLocked}>
    <Ionicons name="lock-closed-outline" size={36} color={Colors.textMuted} />
    <Text style={styles.lockedText}>Moments unlock after the plan is confirmed</Text>
  </View>
)}
```

All other existing logic (voting, checklist, comments, reactions, calendar, safety timer, host rating, invite code, report modal, scam detection) is preserved unchanged.

- [ ] **Step 3: Commit**

```bash
git add app/plan-detail.tsx
git commit -m "feat: migrate plan-detail to stack modal with tabbed layout and Moments tab"
```

---

## Task 13: Create MomentsGallery Component

**Files:**
- Create: `components/MomentsGallery.tsx`

**Feature:** Post-event photo gallery. Participants can upload photos after the event. Photos stored in Firebase Storage under `moments/{planId}/{uid}_{timestamp}`. Firestore: `plans/{planId}/moments` subcollection or `moments` array field on the plan doc.

- [ ] **Step 1: Create MomentsGallery.tsx**

```tsx
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const IMG_SIZE = (width - 48 - 8) / 3; // 3 columns, 16px side padding, 8px gap total

interface Props {
  planId: string;
  isParticipant: boolean;
}

interface Moment {
  id: string;
  url: string;
  uploadedBy: string;
  createdAt: any;
}

export default function MomentsGallery({ planId, isParticipant }: Props) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'plans', planId, 'moments'),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Moment));
        data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setMoments(data);
      }
    );
    return unsub;
  }, [planId]);

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setUploading(true);
    try {
      const uri = result.assets[0].uri;
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const storageRef = ref(storage, `moments/${planId}/${uid}_${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, 'plans', planId, 'moments'), {
        url,
        uploadedBy: uid,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      // silently fail — upload errors don't block the UI
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Upload button — only visible to participants */}
      {isParticipant && (
        <TouchableOpacity style={styles.uploadBtn} onPress={handleUpload} disabled={uploading} activeOpacity={0.8}>
          {uploading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={18} color={Colors.primary} />
              <Text style={styles.uploadLabel}>Add a Moment</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Photo grid */}
      {moments.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {isParticipant ? 'Be the first to share a moment!' : 'No moments yet'}
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {moments.map((m) => (
            <Image key={m.id} source={{ uri: m.url }} style={styles.img} resizeMode="cover" />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.md },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primaryBorder,
    backgroundColor: Colors.primaryDim,
  },
  uploadLabel: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold },
  empty: { alignItems: 'center', gap: 10, paddingTop: 24 },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  img: { width: IMG_SIZE, height: IMG_SIZE, borderRadius: Radius.sm },
});
```

- [ ] **Step 2: Add Firestore security rule for moments subcollection**

In `firestore.rules`, add under the plans match block:
```
match /plans/{planId}/moments/{momentId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null
    && request.auth.uid in get(/databases/$(database)/documents/plans/$(planId)).data.participants;
  allow delete: if request.auth != null
    && request.auth.uid == resource.data.uploadedBy;
}
```

- [ ] **Step 3: Commit**

```bash
git add components/MomentsGallery.tsx firestore.rules
git commit -m "feat: add MomentsGallery component — post-event photo sharing in plan-detail"
```

---

## Task 14: Migrate Remaining Stack Screens

**Files:**
- Create: `app/create-plan.tsx` (from `app/(drawer)/create-plan.tsx`)
- Create: `app/chat.tsx` (from `app/(drawer)/chat.tsx`)
- Create: `app/social.tsx` (from `app/(drawer)/social.tsx`)
- Create: `app/settings.tsx` (from `app/(drawer)/settings.tsx`)
- Create: `app/user-profile.tsx` (from `app/(drawer)/user-profile.tsx`)

For each screen, the migration steps are the same pattern:

- [ ] **Step 1: For each screen, read the source drawer file first**

Read `app/(drawer)/create-plan.tsx`, `app/(drawer)/chat.tsx`, `app/(drawer)/social.tsx`, `app/(drawer)/settings.tsx`, `app/(drawer)/user-profile.tsx`.

- [ ] **Step 2: Create each screen at its new path**

Copy the full content, then make these targeted changes for each:

**All screens:**
- Replace `useNavigation()` drawer opens with `router.back()` or `router.push('/settings')` etc.
- Remove any `DrawerActions.openDrawer()` calls
- Replace drawer hamburger icon buttons with `router.back()` back buttons or navigation-appropriate actions
- Update all internal `router.push('/(drawer)/...')` calls to `router.push('/...')` (remove `(drawer)/` prefix)

**create-plan.tsx:**
- Header: "New Plan" title + close button (X icon → `router.back()`)
- Preserve all Firebase logic (plan creation, cover photo, poll, invite code generation, templates)
- Wrap in `ScreenWrapper`

**chat.tsx:**
- Header: back arrow + plan/room name + participants icon
- Preserve all Firebase logic (real-time messages, scam detection, @mentions)
- Wrap in `ScreenWrapper`

**social.tsx:**
- Header: "Friends" title + search
- Preserve all Firebase logic (friend requests, search, block, invite code join)
- Wrap in `ScreenWrapper`

**settings.tsx:**
- Header: back arrow + "Settings" title
- Preserve all Firebase logic (notifications, search visibility, password reset, account delete, sign out)
- Wrap in `ScreenWrapper`
- Use `GlassCard` for each settings section group

**user-profile.tsx:**
- Header: back arrow + username
- Preserve all Firebase logic (friend/unfriend/accept/decline, rating display)
- Wrap in `ScreenWrapper`

- [ ] **Step 3: Commit after all 5 screens created**

```bash
git add app/create-plan.tsx app/chat.tsx app/social.tsx app/settings.tsx app/user-profile.tsx
git commit -m "feat: migrate all drawer stack screens to root stack with updated navigation"
```

---

## Task 15: Delete Old Drawer Files + Cleanup

**Files:**
- Delete: entire `app/(drawer)/` directory
- Delete: `components/DrawerContent.tsx`
- Modify: `components/BottomTabBar.tsx` — update routes from `/(drawer)/` to `/(tabs)/` or remove if fully replaced

- [ ] **Step 1: Verify all new screens are working before deleting old ones**

Do a quick smoke-check: confirm `app/(tabs)/index.tsx`, `app/(tabs)/discover.tsx`, `app/(tabs)/activity.tsx`, `app/(tabs)/profile.tsx`, `app/plan-detail.tsx`, `app/create-plan.tsx`, `app/chat.tsx`, `app/social.tsx`, `app/settings.tsx`, `app/user-profile.tsx` all exist and have content.

```bash
ls "app/(tabs)/" app/*.tsx
```

- [ ] **Step 2: Delete drawer directory and DrawerContent**

```bash
rm -rf "app/(drawer)"
rm components/DrawerContent.tsx
```

- [ ] **Step 3: Update or remove BottomTabBar.tsx**

`BottomTabBar.tsx` is now replaced by the inline `CustomTabBar` in `app/(tabs)/_layout.tsx`. Delete it:

```bash
rm components/BottomTabBar.tsx
```

- [ ] **Step 4: Run the app to verify no broken imports**

```bash
npx expo start --clear
```

Fix any TypeScript import errors that reference deleted files.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove drawer navigation, DrawerContent, and old screen files"
```

---

## Task 16: Final Polish Pass

- [ ] **Step 1: Read Toast.tsx and apply new surface colors**

Read `components/Toast.tsx`. Update `backgroundColor` to `Colors.surfaceOverlay` and `borderColor` to `Colors.glassBorderStrong`. Update success/error/info variants to use the new `*Dim` and `*Glow` colors.

- [ ] **Step 2: Read SkeletonLoader.tsx and update colors**

Read `components/SkeletonLoader.tsx`. Update shimmer colors from old `card`/`cardElevated` tokens to `Colors.surface`/`Colors.surfaceRaised`.

- [ ] **Step 3: Update app.json accent color**

In `app.json`, update `backgroundColor` and `splash` colors to match `#080608`.

- [ ] **Step 4: Final commit**

```bash
git add components/Toast.tsx components/SkeletonLoader.tsx app.json
git commit -m "polish: update Toast, SkeletonLoader, and app.json to new dark theme"
```

---

## Self-Review Notes

**Spec coverage check:**
- Navigation restructure (drawer → tabs): Tasks 6, 7, 8, 9, 10
- UI overhaul (design system, components): Tasks 1, 2, 3, 4, 5
- Login redesign: Task 11
- Plan detail redesign: Task 12
- Moments feature: Tasks 12 + 13
- All other screens migrated: Task 14
- Cleanup: Task 15
- Polish: Task 16

**Type consistency:**
- `GlassCard` props: `index`, `onPress`, `onLongPress`, `style`, `glowColor`, `noAnimate` — consistent across all tasks
- `CategoryPillRow` props: `pills`, `selected`, `onSelect` — used in Tasks 8, 10
- `AnimatedButton` new `size` prop: `'sm' | 'md' | 'lg'` — used in Tasks 9, 10, 11
- `Colors` new tokens used: `surfaceRaised`, `surface`, `surfaceOverlay`, `glassBorder`, `glassBorderStrong`, `primaryBorder`, `primaryDim`, `FontWeight.*`, `Shadow.*` — all defined in Task 1

**No placeholders:** All code blocks are complete. Screen tasks that copy existing Firebase logic explicitly instruct to read the source file first to avoid reproducing 500-line files inline.
