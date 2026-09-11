import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryPicker, { Country, CountryCode } from 'react-native-country-picker-modal';
import { signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../../lib/firebase';
import { getCities } from '../../lib/cities';
import { Fonts, FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/ThemeContext';
import AnimatedButton from '../../components/AnimatedButton';
import TermsCheckbox from '../../components/TermsCheckbox';

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

// First-time social/phone sign-ins land here: they have a Firebase auth user but
// no users/{uid} profile doc yet. We collect the same required fields the email
// register flow does (minus password), write the doc, and the onAuthStateChanged
// gate in app/_layout.tsx then promotes them into the app.
export default function CompleteProfileScreen() {
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>('US');
  const [country, setCountry] = useState<Country | null>(null);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [city, setCity] = useState('');
  const [showCities, setShowCities] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isMounted = useRef(true);
  useEffect(() => {
    // Prefill the display name from the Google account if present.
    const current = auth.currentUser;
    if (current?.displayName) setDisplayName(current.displayName);
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Theme the country modal so it isn't a jarring light sheet in dark palettes.
  const countryPickerTheme = useMemo(
    () => ({
      backgroundColor: Colors.surfaceRaised,
      onBackgroundTextColor: Colors.text,
      fontSize: FontSize.md,
      filterPlaceholderTextColor: Colors.textMuted,
      activeOpacity: 0.7,
      itemHeight: 44,
    }),
    [Colors],
  );

  const allCities = useMemo(() => getCities(countryCode), [countryCode]);
  const filteredCities = useMemo(() => {
    const term = citySearch.trim().toLowerCase();
    if (!term) return allCities;
    return allCities.filter((c) => c.toLowerCase().includes(term));
  }, [allCities, citySearch]);

  const handleUsernameChange = useCallback(
    (t: string) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, '')),
    [],
  );
  const openCountryPicker = useCallback(() => setCountryPickerVisible(true), []);
  const closeCountryPicker = useCallback(() => setCountryPickerVisible(false), []);
  const toggleCities = useCallback(() => setShowCities((v) => !v), []);
  const handleSelectCountry = useCallback((c: Country) => {
    setCountryCode(c.cca2);
    setCountry(c);
    setCity('');
    setCitySearch('');
    setShowCities(false);
    setCountryPickerVisible(false);
  }, []);
  const handleSelectCity = useCallback((c: string) => {
    setCity(c);
    setShowCities(false);
    setCitySearch('');
  }, []);

  const handleSave = useCallback(async () => {
    if (loading) return;
    setError('');
    const current = auth.currentUser;
    if (!current) {
      setError('Your session expired. Please sign in again.');
      return;
    }
    const trimmedDisplayName = displayName.trim();
    const trimmedUsername = username.trim();

    if (!trimmedDisplayName) {
      setError('Please enter a display name');
      return;
    }
    if (!trimmedUsername) {
      setError('Username is required');
      return;
    }
    if (!USERNAME_RE.test(trimmedUsername)) {
      setError('Username can only contain letters, numbers, and underscores');
      return;
    }
    if (!country) {
      setError('Please select your country');
      return;
    }
    if (!agreedToTerms) {
      setError('Please agree to the Terms and Privacy Policy to continue');
      return;
    }

    setLoading(true);
    try {
      // Reuse the unauthenticated-safe availability check the email register uses.
      const checkUsername = httpsCallable<{ username: string }, { available: boolean }>(
        functions,
        'checkUsername',
      );
      const check = await checkUsername({ username: trimmedUsername });
      if (!check.data.available) {
        const base = trimmedUsername.replace(/\d+$/, '');
        const suggestions = [base + '1', base + '2', base + '_' + Math.floor(Math.random() * 99 + 1)];
        setError(`Username taken. Try: ${suggestions.join(', ')}`);
        return;
      }
      await setDoc(doc(db, 'users', current.uid), {
        displayName: trimmedDisplayName,
        username: trimmedUsername,
        usernameLower: trimmedUsername.toLowerCase(),
        email: current.email || '',
        country: country?.name || countryCode,
        countryCode,
        city,
        createdAt: serverTimestamp(),
        acceptedTermsAt: serverTimestamp(),
        friends: [],
      });
      // The users/{uid} onSnapshot in app/_layout.tsx now sees a complete profile
      // and routes into (tabs); no manual navigation needed.
    } catch (e: any) {
      if (isMounted.current) setError('Something went wrong. Please try again');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [loading, displayName, username, country, countryCode, city, agreedToTerms]);

  const toggleAgreedToTerms = useCallback(() => setAgreedToTerms((v) => !v), []);

  const handleSignOut = useCallback(() => {
    signOut(auth).catch(() => {});
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.subtitle}>
            A few details so friends can find you and plan together.
          </Text>
        </View>

        <View style={styles.formCard}>
          {/* Display name */}
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={20} color={Colors.textMuted} />
            <TextInput
              placeholder="Display Name"
              placeholderTextColor={Colors.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={50}
              style={styles.input}
            />
          </View>

          {/* Username */}
          <View style={styles.inputWrap}>
            <Ionicons name="at-outline" size={20} color={Colors.textMuted} />
            <TextInput
              placeholder="username"
              placeholderTextColor={Colors.textMuted}
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              style={styles.input}
            />
          </View>

          {/* Country */}
          <View style={styles.sectionLabelRow}>
            <Ionicons name="earth-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.sectionLabel}>Location</Text>
          </View>

          <TouchableOpacity
            style={styles.inputWrap}
            onPress={openCountryPicker}
            activeOpacity={0.8}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Select your country"
          >
            <Ionicons name="globe-outline" size={18} color={Colors.textMuted} />
            <Text style={[styles.input, country ? styles.pickerValue : styles.pickerPlaceholder]}>
              {country ? (country.name as string) : 'Select your country'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.hiddenPicker}>
            <CountryPicker
              countryCode={countryCode}
              withEmoji
              withFilter
              withFlag={false}
              withCountryNameButton
              withAlphaFilter
              visible={countryPickerVisible}
              onClose={closeCountryPicker}
              onSelect={handleSelectCountry}
              theme={countryPickerTheme}
            />
          </View>

          {/* City */}
          {country && (
            <>
              <View style={styles.sectionLabelRow}>
                <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.sectionLabel}>City</Text>
              </View>

              <TouchableOpacity
                style={styles.inputWrap}
                onPress={toggleCities}
                activeOpacity={0.8}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Select your city"
              >
                <Ionicons name="location-outline" size={18} color={Colors.textMuted} />
                <Text style={[styles.input, city ? styles.pickerValue : styles.pickerPlaceholder]}>
                  {city || 'Select your city (optional)'}
                </Text>
                <Ionicons
                  name={showCities ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>

              {showCities && (
                <View style={styles.cityDropdown}>
                  <View style={styles.citySearchRow}>
                    <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
                    <TextInput
                      style={styles.citySearchInput}
                      placeholder="Search cities..."
                      placeholderTextColor={Colors.textMuted}
                      value={citySearch}
                      onChangeText={setCitySearch}
                      autoCorrect={false}
                      autoFocus
                    />
                  </View>
                  <ScrollView style={styles.cityList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {filteredCities.length > 0 ? (
                      filteredCities.map((c) => (
                        <TouchableOpacity
                          key={c}
                          style={styles.cityItem}
                          onPress={() => handleSelectCity(c)}
                          accessibilityRole="button"
                          accessibilityLabel={c}
                        >
                          <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                          <Text style={styles.cityItemText}>{c}</Text>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <View style={styles.cityEmpty}>
                        <Text style={styles.cityEmptyText}>No cities match your search.</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}
            </>
          )}

          <TermsCheckbox checked={agreedToTerms} onToggle={toggleAgreedToTerms} />

          {error ? (
            <View style={styles.errorRow} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <AnimatedButton
            label="Continue"
            onPress={handleSave}
            variant="primary"
            size="lg"
            loading={loading}
            disabled={loading}
            style={styles.submitBtn}
          />
        </View>

        <TouchableOpacity
          style={styles.signOutRow}
          onPress={handleSignOut}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.signOutText}>Not you? Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.container,
    paddingVertical: Spacing.xl,
  },
  header: { marginBottom: Spacing.lg, alignItems: 'center' },
  title: {
    fontFamily: Fonts.headingBold,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
  },
  formCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    minHeight: 56,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.body,
    fontSize: FontSize.md,
    lineHeight: 22,
    paddingVertical: 0,
  },
  pickerValue: { color: Colors.text, fontFamily: Fonts.bodyMedium, fontWeight: FontWeight.medium },
  pickerPlaceholder: { color: Colors.textMuted, fontFamily: Fonts.body },
  hiddenPicker: { height: 0, overflow: 'hidden' },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    marginTop: Spacing.xs,
    marginBottom: -Spacing.xs,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.bodyBold,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cityDropdown: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  citySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.background,
  },
  citySearchInput: { flex: 1, paddingVertical: 11, color: Colors.text, fontSize: FontSize.md },
  cityList: { maxHeight: 220 },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    minHeight: 44,
  },
  cityItemText: { color: Colors.text, fontSize: FontSize.md },
  cityEmpty: { paddingVertical: Spacing.lg, paddingHorizontal: Spacing.md, alignItems: 'center' },
  cityEmptyText: {
    color: Colors.text,
    fontFamily: Fonts.bodySemibold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.errorDim,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  errorText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: FontWeight.medium, flex: 1 },
  submitBtn: { marginTop: Spacing.xs },
  signOutRow: { alignItems: 'center', paddingVertical: Spacing.md, marginTop: Spacing.sm },
  signOutText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    letterSpacing: 0.2,
  },
});
