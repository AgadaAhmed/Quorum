# Quorum — Minimalist Spacing & Layout Overhaul
Date: 2026-05-31
Status: Approved

## Goal
Make the app look almost identical to the 4 Stitch Minimalist screens:
- Home - Minimalist
- Profile - Minimalist
- Discover - Minimalist
- Plan Detail - Minimalist

Stitch project ID: `6252728433687344305`

---

## Section 1 — Theme Scale Changes (`lib/theme.ts`)

### Radius (flatten all non-circular elements)
| Token | Old | New |
|-------|-----|-----|
| `xs` | 4 | 0 |
| `sm` | 8 | 0 |
| `md` | 12 | 4 |
| `lg` | 16 | 4 |
| `xl` | 24 | 4 |
| `xxl` | 32 | 4 |
| `full` | 9999 | 9999 (unchanged — avatars, badges) |

### Spacing (bump up for Stitch-level breathing room)
| Token | Old | New |
|-------|-----|-----|
| `xs` | 4 | 4 |
| `sm` | 8 | 12 |
| `md` | 16 | 20 |
| `lg` | 24 | 32 |
| `xl` | 32 | 40 |
| `xxl` | 48 | 56 |
| `container` | 20 | 20 |
| `gutter` | 12 | 16 |

---

## Section 2 — Screen Changes

### Home (`app/(tabs)/index.tsx`)
- Header: logo left, avatar right, `paddingTop: 20`, `paddingHorizontal: 20`
- "Momentum is building" headline: `FontSize.xl`, bold, `marginBottom: 8`
- Section headers: uppercase labels, `fontSize: 11`, `letterSpacing: 1.5`, `fontWeight: 800`, `marginTop: 32`
- Plan cards: `borderRadius: 0`, full-width, `padding: 20`, 1px bottom border divider between cards (no shadow gaps)
- Cover images: sharp corners, `height: 180`
- Friend activity: flat list rows `paddingVertical: 14` with 1px divider between each row, no card wrapping

### Profile (`app/(tabs)/profile.tsx`)
- Hero: avatar centered `width/height: 80`, bold name, muted subtitle
- Stats row: 3 equal columns (number + label), separated by thin vertical dividers, no card
- Sections: full-width, `paddingHorizontal: 20`, `marginTop: 32` between sections
- Category bars: `borderRadius: 0` on track and fill
- Connections: horizontal scroll, no card wrapping

### Discover (`app/(tabs)/discover.tsx`)
- Cards: sharp corners, cover image full-width, info block below `padding: 16`
- Progress bar under each card: flat/sharp, shows quorum %
- Filter pills: `borderRadius: 4`, consistent padding
- Section spacing: `marginTop: 32` between groups

### Plan Detail (`app/plan-detail.tsx`)
- Hero image: full-width, sharp, `height: 220`
- Status badge: flat, uppercase, `borderRadius: 4`, above title
- Tabs: full-width underline style — active tab has 2px solid black bottom border, no background fill
- Attendee row: flat with thin top/bottom 1px dividers
- Location card: `borderRadius: 0`, `padding: 16`, thin `1px` border
- "I'm In" button: full-width, sharp, solid black

---

## Section 3 — Component Changes

### `AnimatedButton`
- `borderRadius: Radius.md` (4px) — no more pill shape
- Primary: solid black fill, no gradient (remove `LinearGradient`)
- Ghost: 1px black border, no fill
- Full-width on screen-level CTAs

### `GlassCard` / `AnimatedCard`
- `borderRadius: 0`
- Replace shadow with `borderWidth: 1, borderColor: rgba(0,0,0,0.08)`
- Internal padding: 20px

### `QuorumProgressBar`
- Track and fill: `borderRadius: 0`
- Height: 6px

### `CategoryPill`
- `borderRadius: 4`
- `paddingHorizontal: 12, paddingVertical: 6`

### `GlassCard`
- Remove blur/glass effect — flat white card with thin border only

### Tab Bar (`app/(tabs)/_layout.tsx`)
- Background: `#ffffff`
- Active indicator: 2px black top border on active tab, remove pill background
- Remove `Shadow.dark`, replace with 1px top border

---

## Implementation Order
1. `lib/theme.ts` — radius + spacing scale
2. `components/AnimatedButton.tsx`
3. `components/GlassCard.tsx`
4. `components/AnimatedCard.tsx`
5. `components/QuorumProgressBar.tsx`
6. `components/CategoryPill.tsx`
7. `app/(tabs)/_layout.tsx` (tab bar)
8. `app/(tabs)/index.tsx` (Home)
9. `app/(tabs)/profile.tsx` (Profile)
10. `app/(tabs)/discover.tsx` (Discover)
11. `app/plan-detail.tsx` (Plan Detail)

---

## Success Criteria
- Cards have sharp (0–4px) corners throughout
- Spacing feels generous and breathable, matching Stitch screenshots
- No pill-shaped buttons on main CTAs
- Tab bar is clean white with underline active state
- Progress bars are flat/rectangular
- No glass blur effects
