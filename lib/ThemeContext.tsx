import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, palettes, THEME_META, type ThemeName, type ThemePalette } from './theme';

const STORAGE_KEY = '@quorum/theme';

type ThemeContextValue = {
  name: ThemeName;
  colors: ThemePalette;
  ready: boolean;
  setTheme: (name: ThemeName) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue>({
  name: 'light',
  colors: Colors,
  ready: true,
  setTheme: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<ThemeName>('light');
  const [ready, setReady] = useState(false);

  // Restore the saved theme on launch. Until it loads we render Light.
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (mounted && saved && saved in palettes) setName(saved as ThemeName);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setTheme = useCallback(async (next: ThemeName) => {
    if (!(next in palettes)) return;
    setName(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ name, colors: palettes[name], ready, setTheme }),
    [name, ready, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Active palette. Safe outside a provider (returns Light). */
export function useTheme(): ThemePalette {
  return useContext(ThemeContext).colors;
}

/** Full theme controls — name, setter, ready flag. */
export function useThemeControls(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Build a StyleSheet from the active palette, memoized per theme. */
export function useThemedStyles<T>(make: (colors: ThemePalette) => T): T {
  const colors = useTheme();
  return useMemo(() => make(colors), [colors, make]);
}

/** Themes the user may select given their tier (Pro unlocks the locked ones). */
export function availableThemes(isPro: boolean): ThemeName[] {
  return (Object.keys(palettes) as ThemeName[]).filter(
    (n) => isPro || !THEME_META[n].pro
  );
}
