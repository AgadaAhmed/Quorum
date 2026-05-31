// ─────────────────────────────────────────────────────────────────────────────
// Quorum Design System — "Minimalist" (Stitch variant)
// Primary: Black  |  Secondary: Teal  |  Accent: Red
// Fonts: Plus Jakarta Sans (headings) + Inter (body)
// ─────────────────────────────────────────────────────────────────────────────

export const Colors = {
  // ── Base backgrounds (M3 light surface hierarchy) ─────────────────────────
  background:     '#fbf8ff',   // Surface / background (off-white)
  backgroundAlt:  '#ffffff',   // Surface container lowest
  surface:        '#fbf8ff',
  surfaceRaised:  '#eeedf7',   // Surface container (cards)
  surfaceOverlay: '#e8e7f1',   // Surface container high (elevated cards)
  surfaceBright:  '#e3e1ec',   // Surface bright (hover / press states)

  // ── Glass (semi-transparent overlays — light frosted) ────────────────────
  glass:              'rgba(255,255,255,0.8)',
  glassMid:           'rgba(0,0,0,0.04)',
  glassStrong:        'rgba(0,0,0,0.08)',
  glassBorder:        'rgba(0,0,0,0.08)',
  glassBorderStrong:  'rgba(0,0,0,0.14)',
  glassHighlight:     'rgba(255,255,255,0.6)',

  // ── Primary — Black ───────────────────────────────────────────────────────
  primary:          '#000000',
  primaryLight:     '#1a1b22',
  primaryContainer: '#1b1b1b',
  primaryDim:       'rgba(0,0,0,0.08)',
  primaryGlow:      'rgba(0,0,0,0.15)',
  primaryBorder:    'rgba(0,0,0,0.30)',

  // ── Secondary — Teal (confirmations / success / quorum reached) ───────────
  secondary:      '#0d9488',
  secondaryLight: '#2dd4bf',
  secondaryDim:   'rgba(13,148,136,0.12)',
  secondaryBorder:'rgba(13,148,136,0.30)',

  // ── Tertiary / Accent — Red (notifications / live / destructive) ──────────
  tertiary:      '#ba1a1a',
  tertiaryLight: '#ff5449',
  tertiaryDim:   'rgba(186,26,26,0.10)',
  tertiaryBorder:'rgba(186,26,26,0.28)',

  // ── Gold (pins / premium) ─────────────────────────────────────────────────
  gold:       '#b45309',
  goldLight:  '#d97706',
  goldDim:    'rgba(180,83,9,0.10)',
  goldGlow:   'rgba(180,83,9,0.20)',
  goldBorder: 'rgba(180,83,9,0.28)',

  // ── Text ──────────────────────────────────────────────────────────────────
  text:         '#1a1b22',   // on-surface
  textSecondary:'#4c4546',   // on-surface-variant
  textMuted:    '#7e7576',   // outline
  textDisabled: '#cfc4c5',   // outline-variant

  // ── Status ────────────────────────────────────────────────────────────────
  success:    '#0d9488',   // teal — quorum confirmed
  successDim: 'rgba(13,148,136,0.12)',
  successGlow:'rgba(13,148,136,0.20)',
  error:      '#ba1a1a',
  errorDim:   'rgba(186,26,26,0.10)',

  // ── Misc ──────────────────────────────────────────────────────────────────
  border:       'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.16)',
  overlay:      'rgba(0,0,0,0.50)',
  overlayLight: 'rgba(0,0,0,0.28)',

  // ── Legacy aliases ────────────────────────────────────────────────────────
  card:         '#eeedf7',
  cardElevated: '#e8e7f1',

  /** @deprecated use primary */
  primaryLegacyRose: '#ba1a1a',
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
// Shadows
// ─────────────────────────────────────────────────────────────────────────────
export const Shadow = {
  /** Primary card shadow — light mode */
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
  /** Teal glow — confirmed/success states */
  teal: {
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  /** Red — notifications, live, urgent */
  rose: {
    shadowColor: '#ba1a1a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  roseStrong: {
    shadowColor: '#ba1a1a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  gold: {
    shadowColor: '#b45309',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
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
