/* eslint-env jest */
// Icons pull in expo-font/expo-asset native loading, which doesn't resolve
// under Jest. Render them as plain <Text>{name}</Text> instead.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, ...props }) => React.createElement(Text, props, String(name));
  return { Ionicons: Icon };
});
