/* eslint-env jest */
// Icons pull in expo-font/expo-asset native loading, which doesn't resolve
// under Jest. Render them as plain <Text>{name}</Text> instead.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, ...props }) => React.createElement(Text, props, String(name));
  return { Ionicons: Icon };
});

// lib/ThemeContext.tsx (used by useTheme/useThemedStyles) persists the active
// theme via AsyncStorage, which has no native module under Jest. Apply the
// package's official in-memory mock globally so any component that pulls in
// ThemeContext renders under test, not just files that mock it locally.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// @react-native-community/netinfo is a native module; stub its listener API so
// components that subscribe (OfflineBanner) render under Jest.
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
}));

// @react-native-google-signin/google-signin is a native module with no JS impl
// under Jest. lib/googleAuth lazy-requires it, but provide a stub so anything
// that does pull it in (or future login-screen tests) doesn't blow up.
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ type: 'success', data: { idToken: 'test-token' } })),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));
