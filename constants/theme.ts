/**
 * Strictly monochrome theme (black / white / grey only) kept in the legacy
 * `Colors.light` / `Colors.dark` shape so existing template consumers keep
 * working. Prefer the richer tokens in `lib/theme.ts` for new code.
 */

import { Platform } from 'react-native';

const tintColorLight = '#000000';
const tintColorDark = '#ffffff';

export const Colors = {
  light: {
    text: '#1a1b22',
    background: '#ffffff',
    tint: tintColorLight,
    icon: '#5c5959',
    tabIconDefault: '#5c5959',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ededed',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9b9b9b',
    tabIconDefault: '#9b9b9b',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
