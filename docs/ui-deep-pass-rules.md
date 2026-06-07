# Deep UI/UX Pass — Swarm Agent Rules (TEMPORARY)

> Swarm: swarm-1780777484450-pl6x22 (hierarchical). Delete this file when merged.
> This is a UI-PRIORITY pass. The code was already cleaned for perf/bugs/monochrome.
> Your job now is to make each screen look and feel genuinely polished and
> professional. Go DEEP on visual quality. You own ONE screen file.

## ABSOLUTE CONSTRAINTS (never violate)
1. Strictly monochrome: black / white / grey ONLY. No hue. Use `lib/theme.ts` tokens.
2. NO emojis anywhere (text, labels, placeholders, comments).
3. No new dependencies. No API/Firebase/auth/data-model changes. Preserve behavior.
4. Stay in your assigned file. Report cross-file issues; don't edit shared components/theme.

## DEEP UI CHECKLIST — apply rigorously to your screen

### A. Visual hierarchy & typography
- One clear primary action per screen; secondary actions visually subordinate.
- Establish hierarchy with SIZE + WEIGHT + SPACING, never color (we have none).
  Use the type scale: FontSize.xs 12 / sm 14 / md 16 / lg 18 / xl 24 / xxl 32 / xxxl 40.
- Body text >= 16 (FontSize.md). Section labels: FontSize.xs, FontWeight.heavy, uppercase, letterSpacing ~1.5.
- Titles use Fonts.heading/headingBold; body uses Fonts.body* families.
- Line-height >= 1.4 on multi-line text; add `lineHeight` where missing.
- Use tabular figures / fixed widths for counts, timers, dates so layout doesn't jitter.

### B. Spacing & rhythm
- Strict 4/8 rhythm via Spacing tokens (xs4 / sm12 / md20 / lg32 / xl40). No random 7/13/18px.
- Consistent screen horizontal inset (Spacing.container 20) on every section.
- Clear vertical section spacing tiers; group related items, separate sections.
- Remove cramped or uneven gaps; align elements to a shared grid/baseline.

### C. Contrast & legibility (monochrome-critical)
- Primary text (#1a1b22) on white: fine. Secondary (#4c4546) fine. Muted (#5c5959) >= 3:1 — OK for hints only, never body.
- Ensure dividers/borders are actually visible (border rgba(0,0,0,0.08) can be too faint on busy rows — bump to borderStrong where a real separation is needed).
- Text on dark surfaces (black buttons, image overlays) must be Colors.background/white.
- Disabled state: opacity ~0.4 + non-interactive, clearly distinct from enabled.

### D. Touch, interaction & feedback
- Every tappable target >= 44x44pt; add `hitSlop` for icons smaller than that.
- Press feedback on ALL touchables: activeOpacity ~0.7 or a subtle scale (0.97) — never a 0ms snap.
- Loading: disable the control + show ActivityIndicator/spinner during async.
- Modals: scrim/overlay must be strong (Colors.overlay = rgba(0,0,0,0.5)); add onRequestClose; provide a clear close affordance.

### E. States (don't skip)
- Empty state: meaningful message + guidance + (where sensible) an action. Centered, calm, on-brand. No emoji.
- Loading state: skeleton/shimmer for >300ms loads, not a bare spinner where a skeleton fits.
- Error state: clear cause + recovery path (retry).

### F. Layout & safe areas
- Respect safe areas for headers and any fixed/bottom bars (ScreenWrapper handles edges).
- Scroll content must not hide behind fixed headers/footers — add content insets/paddingBottom.
- No horizontal overflow. Long text uses numberOfLines + ellipsis where it could break layout.

### G. Icons & consistency
- @expo/vector-icons (Ionicons) only, consistent sizing (prefer 20/24), consistent outline style.
- Icon + label for navigation/actions where discoverability matters.

### H. Motion (subtle)
- Micro-interactions 150-300ms, ease-out on enter. Animate transform/opacity only.
- Stagger list entrances ~30-50ms if entrance animation exists. Respect reduced-motion if trivially available.
- Don't add heavy new animation; refine what's there.

## Theme tokens available (lib/theme.ts)
Colors (grayscale): background #fff, surfaceRaised #f2f2f2, surfaceOverlay #e8e8e8,
surfaceBright #e0e0e0, primary #000, text #1a1b22, textSecondary #4c4546,
textMuted #5c5959, textDisabled #cfc4c5, border rgba(0,0,0,0.08),
borderStrong rgba(0,0,0,0.30), overlay rgba(0,0,0,0.50).
Spacing, Radius, FontSize, FontWeight, Fonts, Shadow — all exported.

## Output
Return a focused summary: the specific UI/UX improvements you made (hierarchy,
spacing, contrast, states, touch, motion), before/after notes for the most
impactful changes, and any cross-file/shared-component issues for the coordinator.
Keep behavior identical — this is a visual/interaction polish pass.
