import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type ThemePalette } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/ThemeContext';

/** Top-right entry to the messages inbox (global chat + DMs). Sits beside the
 *  profile avatar on the main screens. */
export default function InboxButton() {
  const router = useRouter();
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => router.push('/inbox' as any)}
      activeOpacity={0.7}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open messages"
    >
      <Ionicons name="chatbubble-ellipses-outline" size={24} color={Colors.text} />
    </TouchableOpacity>
  );
}

const makeStyles = (_Colors: ThemePalette) =>
  StyleSheet.create({
    btn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  });
