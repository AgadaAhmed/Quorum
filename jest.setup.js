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
