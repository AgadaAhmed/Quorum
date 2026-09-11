import React, { useCallback } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRIVACY_URL, TERMS_URL } from '../lib/support';
import { Fonts, FontSize, FontWeight, Spacing, type ThemePalette } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/ThemeContext';

// Required legal-acceptance row for account creation (email register +
// complete-profile). The Terms / Privacy words open the hosted pages on
// quorums.co.za. Monochrome; the checkbox state is carried by the icon + label.
export default function TermsCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  const openTerms = useCallback(() => {
    Linking.openURL(TERMS_URL).catch(() => {});
  }, []);
  const openPrivacy = useCallback(() => {
    Linking.openURL(PRIVACY_URL).catch(() => {});
  }, []);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.boxBtn}
        hitSlop={styles.hitSlop}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="I agree to the Terms and Privacy Policy"
      >
        <Ionicons
          name={checked ? 'checkbox' : 'square-outline'}
          size={22}
          color={checked ? Colors.primary : Colors.textMuted}
        />
      </TouchableOpacity>
      <Text style={styles.text}>
        I agree to the{' '}
        <Text style={styles.link} onPress={openTerms}>
          Terms
        </Text>{' '}
        and{' '}
        <Text style={styles.link} onPress={openPrivacy}>
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  boxBtn: {
    paddingTop: 1,
  },
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
  text: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  link: {
    fontFamily: Fonts.bodySemibold,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    textDecorationLine: 'underline',
  },
});
