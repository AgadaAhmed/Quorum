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
  glassHighlight: 'rgba(255,255,255,0.09)',

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
