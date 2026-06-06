import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export function HelloWave() {
  return <ThemedText style={styles.text}>Hi</ThemedText>;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 28,
    lineHeight: 32,
    marginTop: -6,
  },
});
