import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ThemeProvider,
  useTheme,
  useThemeControls,
  availableThemes,
} from '../../lib/ThemeContext';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

// The async-storage mock persists across tests; reset it so a saved theme from
// one test doesn't leak into the next.
beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('ThemeProvider', () => {
  it('defaults to the Light palette', () => {
    const { result } = renderHook(() => ({ ctl: useThemeControls(), colors: useTheme() }), {
      wrapper,
    });
    expect(result.current.ctl.name).toBe('light');
    expect(result.current.colors.background).toBe('#ffffff');
  });

  it('switches palette when setTheme is called', async () => {
    const { result } = renderHook(() => ({ ctl: useThemeControls(), colors: useTheme() }), {
      wrapper,
    });
    await act(async () => {
      await result.current.ctl.setTheme('midnight');
    });
    expect(result.current.ctl.name).toBe('midnight');
    expect(result.current.colors.background).toBe('#121212');
  });

  it('ignores unknown theme names', async () => {
    const { result } = renderHook(() => useThemeControls(), { wrapper });
    await act(async () => {
      // @ts-expect-error testing an invalid name
      await result.current.setTheme('rainbow');
    });
    expect(result.current.name).toBe('light');
  });
});

describe('availableThemes', () => {
  it('hides Pro themes from free users', () => {
    expect(availableThemes(false)).toEqual(['light', 'midnight']);
  });
  it('gives Pro users every theme', () => {
    expect(availableThemes(true)).toEqual(['light', 'midnight', 'amoled']);
  });
});
