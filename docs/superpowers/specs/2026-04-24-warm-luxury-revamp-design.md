# Warm Luxury UI Revamp — Design Spec

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Full visual rebuild of the Quorum app from the current Carbon Rose dark theme to a Warm Luxury aesthetic — deep black/brown base, amber and gold accents, bold Dark Cover Banner plan cards.

**Architecture:** Theme tokens in `lib/theme.ts` are the single source of truth for all colors. A new `PlanCard` component replaces `GlassCard` for all plan-specific cards. All other components and screens inherit the new palette through token references.

**Tech Stack:** React Native, Expo SDK 55, expo-linear-gradient, TypeScript

---

## Section 1 — Color System (`lib/theme.ts`)

Full replacement of the rose palette with warm amber/gold. Surfaces shift to deep brown-black.

### Color Token Changes

| Token | Current Value | New Value |
|---|---|---|
| `background` | `#080608` | `#060402` |
| `backgroundAlt` | `#0c090f` | `#0a0806` |
| `surface` | `#100d14` | `#0d0a07` |
| `surfaceRaised` | `#181320` | `#1c1005` |
| `surfaceOverlay` | `#201828` | `#2a1a08` |
| `primary` | `#f43f5e` | `#d97706` |
| `primaryLight` | `#fb7185` | `#fbbf24` |
| `primaryDim` | `rgba(244,63,94,0.12)` | `rgba(217,119,6,0.12)` |
| `primaryGlow` | `rgba(244,63,94,0.28)` | `rgba(217,119,6,0.28)` |
| `primaryBorder` | `rgba(244,63,94,0.35)` | `rgba(217,119,6,0.35)` |
| `text` | `#fef2f4` | `#fef3c7` |
| `textSecondary` | `#c09098` | `#a16207` |
| `textMuted` | `#7a5060` | `#78350f` |
| `textDisabled` | `#3d2535` | `#451a03` |
| `glassBorder` | `rgba(255,255,255,0.07)` | `rgba(255,255,255,0.06)` |
| `glassBorderStrong` | `rgba(255,255,255,0.14)` | `rgba(217,119,6,0.2)` |
| `glassHighlight` | `rgba(255,255,255,0.09)` | `rgba(255,255,255,0.07)` |
| `card` (legacy) | `#181320` | `#1c1005` |
| `cardElevated` (legacy) | `#201828` | `#2a1a08` |

### Tokens That Stay Unchanged
- `gold`, `goldLight`, `goldDim`, `goldGlow` — unchanged
- `success`, `successDim`, `successGlow` — unchanged
- `error`, `errorDim` — unchanged
- `border`, `borderStrong`, `overlay`, `overlayLight` — unchanged

### Shadow Updates (`Shadow` object)
- `Shadow.rose` and `Shadow.roseStrong` — `shadowColor` changes from `#f43f5e` to `#d97706`

---

## Section 2 — Components

### 2a. New Component: `PlanCard`

**File:** `components/PlanCard.tsx`

Purpose: Bold Dark Cover Banner for plan display. Replaces `GlassCard` wherever a plan object is rendered in Home and Discover.

**Props:**
```typescript
interface PlanCardProps {
  plan: {
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
  };
  index?: number;
  onPress?: () => void;
  uid?: string; // to show join/view button state
}
```

**Visual structure:**
- Full-bleed gradient background. Color determined by category:
  - Food → `#451a03` to `#c2610a`
  - Travel → `#0c2340` to `#1d4ed8`
  - Music → `#1e0a3c` to `#7c3aed`
  - Art → `#1a0a2e` to `#9333ea`
  - Gaming → `#0a1a0a` to `#15803d`
  - Sports → `#0a1020` to `#0369a1`
  - Party → `#2a0a1a` to `#be185d`
  - Study → `#0a0a1a` to `#1d4ed8`
  - Default → `#1c1005` to `#92400e`
- `LinearGradient` top-to-bottom overlay (`transparent` → `rgba(0,0,0,0.55)`) for text legibility
- If `coverUrl` is set, show `<Image>` instead of gradient, with dark overlay
- **Top row:** category badge (left) + status badge (right), both semi-transparent
- **Title:** large, 900-weight, white, bottom-anchored
- **Meta row:** date chip, location chip, participants chip — small, semi-transparent
- **Progress bar:** 4px, amber gradient, at the bottom of the cover
- Entrance animation: same staggered fade+slide as current `GlassCard`
- Press animation: scale 0.972 on press-in

**No separate body section.** Everything lives on the cover.

### 2b. Updated: `GlassCard`

Stays as a generic surface container for non-plan UI (friend request cards, settings rows, modal sheets, etc.). Changes:
- Border color: `Colors.glassBorderStrong` → `rgba(217,119,6,0.18)` when no `glowColor` prop
- Shadow: `Shadow.dark` stays, rose shadow option removed
- Top highlight streak stays

### 2c. Updated: `AnimatedButton`

- `variant="primary"` gradient: `['#fbbf24', '#d97706', '#b45309']` (amber, replacing rose)
- `variant="gold"` gradient: unchanged
- `variant="ghost"` border: `Colors.primaryBorder` (now amber via token)
- `variant="danger"` border: unchanged
- `txtColor` for `primary`: stays `#fff`

### 2d. Updated: `CategoryPill`

- Active pill background: `Colors.primaryDim` (now amber dim via token)
- Active pill border: `Colors.primaryBorder` (now amber border via token)
- Active label color: `Colors.primary` (now amber via token)

### 2e. Updated: `QuorumProgressBar`

- Pending gradient: `[Colors.primaryLight, Colors.primary]` → automatically amber via token (`#fbbf24` → `#d97706`)
- Confirmed/reached gradient: `[Colors.goldLight, Colors.gold]` → unchanged
- Glow layer: `Colors.primary` → automatically amber

### 2f. Updated: `Toast`

- `successDim` background: unchanged (green)
- `errorDim` background: unchanged (orange)
- `primaryDim` background (info): now amber dim via token

---

## Section 3 — Screens

All screens inherit the warm palette automatically through token references. The following screens need explicit updates beyond token inheritance:

### 3a. Tab Bar (`app/(tabs)/_layout.tsx`)

- `borderTopColor`: `Colors.glassBorder` → `rgba(217,119,6,0.3)` (amber top border)
- Active tab `backgroundColor` in `iconWrapActive`: `Colors.primaryDim` → automatically amber via token
- Create button gradient: `Colors.primary` → automatically amber via token
- Shadow on create button: `Shadow.roseStrong` → `Shadow.amberStrong` (new shadow token)

Add to `Shadow` in theme:
```typescript
amberStrong: {
  shadowColor: '#d97706',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.5,
  shadowRadius: 24,
  elevation: 16,
},
```

### 3b. Home (`app/(tabs)/index.tsx`)

- Replace all `<GlassCard>` plan card renders with `<PlanCard>`
- Remove inline card body styling (now handled inside `PlanCard`)
- Category filter pills: inherit amber via `CategoryPill` token update
- Swipe actions: amber background instead of rose
- Header greeting and countdown chips: amber via tokens

### 3c. Discover (`app/(tabs)/discover.tsx`)

- Replace plan card renders with `<PlanCard>`
- "Yours" badge: `Colors.goldDim` → unchanged
- Distance chip: `Colors.primaryDim` → amber dim via token
- Join button inside `PlanCard`: amber styled

### 3d. Login (`app/(auth)/login.tsx`)

- Logo `Q` circle: `Colors.primary` background → amber via token
- Logo glow: `Colors.primaryGlow` → amber via token
- `GlassInput` focus ring: `Colors.primaryBorder` → amber via token
- Password strength bar segments: amber scale instead of red→green
  - Weak: `#ef4444` (keep red)
  - Fair: `#d97706` (amber)
  - Strong: `#fbbf24` (amber light)
  - Very strong: `#fde68a` (amber pale)
- Mode selector active pill: `Colors.primary` → amber via token
- "Sign in / Register" button: `AnimatedButton variant="primary"` → amber via component update

### 3e. Plan Detail (`app/plan-detail.tsx`)

- Top cover section: replace current cover image / gradient with `PlanCard`-style full-bleed gradient banner (same gradient logic as `PlanCard` based on category)
- Vote button: amber gradient
- Join/Leave buttons: amber via `AnimatedButton` update
- Chat button: amber via tokens
- All accent colors (status pills, countdown chips): amber via tokens

### 3f. Create Plan (`app/create-plan.tsx`)

- `TextInput` borders on focus: amber via tokens
- Category pill selection: amber via `CategoryPill` update
- Toggle switch (isPublic): amber when active
- Submit button: amber via `AnimatedButton` update
- Cover picker border: amber via tokens

### 3g. Profile (`app/(tabs)/profile.tsx`)

- Hero gradient: `#f43f5e33` → `rgba(217,119,6,0.2)` at top
- Avatar ring: `Colors.primaryBorder` → amber via token
- Camera badge: `Colors.primary` → amber via token
- Stat values: `Colors.text` → unchanged; rating gold → unchanged
- Edit Profile, Settings, Friends buttons: amber via `AnimatedButton`

### 3h. Activity (`app/(tabs)/activity.tsx`)

- Icon circles for `plan_joined`: `Colors.primary` → amber via token
- Time group labels: `Colors.textMuted` → amber dim via token
- Friend request accept button: amber via `AnimatedButton`

### 3i. Chat (`app/chat.tsx`)

- Own message bubble: amber dim background + amber border
- Reaction picker active state: amber
- Send button: amber

### 3j. Social (`app/social.tsx`)

- Friend request send button: amber via `AnimatedButton`
- Search input focus: amber via tokens
- Plan invite join button: amber

### 3k. Settings (`app/settings.tsx`)

- Toggle switches when active: amber
- Danger zone section: keeps red/error color

### 3l. User Profile (`app/user-profile.tsx`)

- Add Friend button: amber via `AnimatedButton`
- Shared plans accent: amber via tokens

---

## Category Gradient Map

Used by `PlanCard` and `plan-detail.tsx` cover banner:

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
  default: ['#1c1005', '#92400e'],
};
```

---

## Out of Scope

- Firebase schema changes
- New screens or navigation structure
- Notification system changes
- Any feature additions (this is visual-only)
