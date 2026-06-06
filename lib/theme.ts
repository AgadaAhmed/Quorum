// ─────────────────────────────────────────────────────────────────────────────
// Quorum Design System — "Monochrome"
// Strictly black / white / grey. No hue. Meaning is carried by weight,
// size, borders, and iconography — never color.
// Fonts: Plus Jakarta Sans (headings) + Inter (body)
// ─────────────────────────────────────────────────────────────────────────────

export const Colors = {
  // ── Base backgrounds ──────────────────────────────────────────────────────
  background:     '#ffffff',
  backgroundAlt:  '#ffffff',
  surface:        '#ffffff',
  surfaceRaised:  '#f2f2f2',   // cards
  surfaceOverlay: '#e8e8e8',   // elevated cards
  surfaceBright:  '#e0e0e0',   // hover / press

  // ── Glass (semi-transparent neutral overlays) ─────────────────────────────
  glass:              'rgba(255,255,255,0.8)',
  glassMid:           'rgba(0,0,0,0.04)',
  glassStrong:        'rgba(0,0,0,0.08)',
  glassBorder:        'rgba(0,0,0,0.15)',
  glassBorderStrong:  'rgba(0,0,0,0.25)',
  glassHighlight:     'rgba(255,255,255,0.6)',

  // ── Primary — Black ───────────────────────────────────────────────────────
  primary:          '#000000',
  primaryLight:     '#1a1b22',
  primaryContainer: '#1b1b1b',
  primaryDim:       'rgba(0,0,0,0.08)',
  primaryGlow:      'rgba(0,0,0,0.15)',
  primaryBorder:    'rgba(0,0,0,0.55)',

  // ── Secondary (was teal — success / quorum reached) → dark grey ───────────
  secondary:      '#2b2b2b',
  secondaryLight: '#555555',
  secondaryDim:   'rgba(0,0,0,0.06)',
  secondaryBorder:'rgba(0,0,0,0.22)',

  // ── Tertiary / Accent (was red — live / destructive) → near-black ─────────
  tertiary:      '#1a1a1a',
  tertiaryLight: '#444444',
  tertiaryDim:   'rgba(0,0,0,0.06)',
  tertiaryBorder:'rgba(0,0,0,0.22)',

  // ── Gold (was amber — pins / premium) → mid grey ──────────────────────────
  gold:       '#4a4a4a',
  goldLight:  '#6b6b6b',
  goldDim:    'rgba(0,0,0,0.06)',
  goldGlow:   'rgba(0,0,0,0.12)',
  goldBorder: 'rgba(0,0,0,0.22)',

  // ── Text ──────────────────────────────────────────────────────────────────
  text:         '#1a1b22',
  textSecondary:'#4c4546',
  textMuted:    '#5c5959',
  textDisabled: '#cfc4c5',

  // ── Status (grayscale — distinguish by context, not hue) ──────────────────
  success:    '#2b2b2b',
  successDim: 'rgba(0,0,0,0.06)',
  successGlow:'rgba(0,0,0,0.12)',
  error:      '#1a1a1a',
  errorDim:   'rgba(0,0,0,0.06)',

  // ── Misc ──────────────────────────────────────────────────────────────────
  border:       'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.30)',
  overlay:      'rgba(0,0,0,0.50)',
  overlayLight: 'rgba(0,0,0,0.28)',

  // ── Legacy aliases ────────────────────────────────────────────────────────
  card:         '#f2f2f2',
  cardElevated: '#e8e8e8',

  /** @deprecated use primary */
  primaryLegacyRose: '#1a1a1a',
};

// ─────────────────────────────────────────────────────────────────────────────
// Spacing  (4px base rhythm)
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Border radius  (matches Stitch rounded scale)
// ─────────────────────────────────────────────────────────────────────────────
export const Radius = {
  xs:   0,
  sm:   0,
  md:   4,
  lg:   4,
  xl:   4,
  xxl:  4,
  full: 9999,
};

// ─────────────────────────────────────────────────────────────────────────────
// Font sizes  (matches Stitch typography scale)
// ─────────────────────────────────────────────────────────────────────────────
export const FontSize = {
  xs:   12,  // label-sm
  sm:   14,  // label-md
  md:   16,  // body-md
  lg:   18,  // body-lg
  xl:   24,  // headline-md
  xxl:  32,  // headline-lg
  xxxl: 40,  // display
};

// ─────────────────────────────────────────────────────────────────────────────
// Font weights
// ─────────────────────────────────────────────────────────────────────────────
export const FontWeight = {
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
  heavy:    '800' as const,
  black:    '900' as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Font families
// Load via @expo-google-fonts/plus-jakarta-sans + @expo-google-fonts/inter
// or add to assets/fonts/ manually.
// Falls back to system sans-serif gracefully.
// ─────────────────────────────────────────────────────────────────────────────
export const Fonts = {
  /** Plus Jakarta Sans — headings, display, hero text */
  heading: 'PlusJakartaSans_700Bold',
  headingBold: 'PlusJakartaSans_800ExtraBold',
  headingSemibold: 'PlusJakartaSans_600SemiBold',
  /** Inter — body text, labels, UI strings */
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
};

// ─────────────────────────────────────────────────────────────────────────────
// Shadows  (neutral only — black shadow color throughout)
// ─────────────────────────────────────────────────────────────────────────────
export const Shadow = {
  /** Primary card shadow */
  primary: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryStrong: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  /** was teal glow — now neutral */
  teal: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  /** was red — now neutral */
  rose: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  roseStrong: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 12,
  },
  gold: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  // Legacy aliases
  indigo: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  indigoStrong: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  dark: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
};
