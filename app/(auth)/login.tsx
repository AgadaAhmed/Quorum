import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import CountryPicker, { Country, CountryCode } from 'react-native-country-picker-modal';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { getCities } from '../../lib/cities';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';
import AnimatedButton from '../../components/AnimatedButton';

type AutoCapitalize = 'none' | 'sentences' | 'words' | 'characters';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const MIN_PASSWORD_LENGTH = 6;

// ── GlassInput ──────────────────────────────────────────────────────────────
interface GlassInputProps {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: AutoCapitalize;
  editable?: boolean;
  rightElement?: React.ReactNode;
  maxLength?: number;
  textContentType?: React.ComponentProps<typeof TextInput>['textContentType'];
  onSubmitEditing?: () => void;
  returnKeyType?: React.ComponentProps<typeof TextInput>['returnKeyType'];
}

const GlassInput = React.memo(function GlassInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  editable,
  rightElement,
  maxLength,
  textContentType,
  onSubmitEditing,
  returnKeyType,
}: GlassInputProps) {
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  return (
    <View
      style={[
        inputStyles.wrap,
        focused && inputStyles.wrapFocused,
        editable === false && inputStyles.wrapDisabled,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={focused ? Colors.primary : Colors.textMuted}
      />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'none'}
        autoCorrect={false}
        editable={editable !== false}
        onFocus={handleFocus}
        onBlur={handleBlur}
        maxLength={maxLength}
        textContentType={textContentType}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        style={inputStyles.input}
      />
      {rightElement}
    </View>
  );
});

const inputStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    minHeight: 52,
  },
  wrapFocused: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: Colors.backgroundAlt,
  },
  wrapDisabled: { opacity: 0.5 },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.md,
    lineHeight: 22,
    paddingVertical: 0,
  },
  inputAsButton: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.md,
    lineHeight: 22,
    paddingVertical: 0,
  },
});

// ── Password Strength Bar ─────────────────────────────────────────────────────
// Monochrome: meaning is carried by how many segments fill and the label text,
// never by hue. All segments use a single neutral fill color.
function getPasswordStrength(pw: string): { label: string; segments: number } {
  if (pw.length < MIN_PASSWORD_LENGTH) return { label: 'Too short', segments: 1 };
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const score = [pw.length >= 8, hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
  if (score <= 2) return { label: 'Weak', segments: 2 };
  if (score === 3) return { label: 'Fair', segments: 3 };
  if (score === 4) return { label: 'Strong', segments: 4 };
  return { label: 'Very strong', segments: 5 };
}

const PasswordStrengthBar = React.memo(function PasswordStrengthBar({
  password,
}: {
  password: string;
}) {
  const { label, segments } = useMemo(() => getPasswordStrength(password), [password]);
  return (
    <View style={styles.strengthWrap}>
      <View style={styles.strengthBarRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[
              styles.strengthSegment,
              { backgroundColor: i <= segments ? Colors.text : Colors.border },
            ]}
          />
        ))}
      </View>
      <Text style={styles.strengthLabel}>{label}</Text>
    </View>
  );
});

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register fields
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>('US');
  const [country, setCountry] = useState<Country | null>(null);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [city, setCity] = useState('');
  const [showCities, setShowCities] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  // State
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Animations
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(32)).current;
  // Guards against state updates after unmount (timeout / async).
  const isMounted = useRef(true);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(formTranslateY, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ]),
    ]);
    animation.start();
    return () => {
      isMounted.current = false;
      animation.stop();
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, [logoScale, logoOpacity, formOpacity, formTranslateY]);

  const allCities = useMemo(() => getCities(countryCode), [countryCode]);
  const filteredCities = useMemo(() => {
    const term = citySearch.trim().toLowerCase();
    if (!term) return allCities;
    return allCities.filter((c) => c.toLowerCase().includes(term));
  }, [allCities, citySearch]);

  // ── Auth handlers ───────────────────────────────────────────────────────
  const handleAuth = useCallback(async () => {
    if (loading) return;
    setError('');

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const trimmedDisplayName = displayName.trim();

    // ── Shared client-side validation ──
    if (!trimmedEmail) {
      setError('Please enter your email address');
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    // ── Register-only validation ──
    if (mode === 'register') {
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
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        return;
      }
      if (!country) {
        setError('Please select your country');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      } else {
        const taken = await getDocs(
          query(collection(db, 'users'), where('usernameLower', '==', trimmedUsername.toLowerCase()))
        );
        if (!taken.empty) {
          const base = trimmedUsername.replace(/\d+$/, '');
          const suggestions = [base + '1', base + '2', base + '_' + Math.floor(Math.random() * 99 + 1)];
          setError(`Username taken. Try: ${suggestions.join(', ')}`);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          displayName: trimmedDisplayName,
          username: trimmedUsername,
          usernameLower: trimmedUsername.toLowerCase(),
          email: trimmedEmail,
          country: country?.name || countryCode,
          countryCode,
          city,
          createdAt: serverTimestamp(),
          friends: [],
        });
      }
      router.replace('/(tabs)/');
    } catch (e: any) {
      const code = e?.code || '';
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setError('Incorrect email or password');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address');
      } else if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later');
      } else if (code === 'auth/weak-password') {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Check your connection and try again');
      } else {
        setError('Something went wrong. Please try again');
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [loading, email, username, displayName, password, mode, country, countryCode, city, router]);

  const handleForgotPassword = useCallback(async () => {
    if (resetting) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email above first, then tap Forgot password');
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      if (!isMounted.current) return;
      setResetSent(true);
      setError('');
      if (resetTimer.current) clearTimeout(resetTimer.current);
      // Auto-dismiss the confirmation after 4 seconds
      resetTimer.current = setTimeout(() => {
        if (isMounted.current) setResetSent(false);
      }, 4000);
    } catch (e: any) {
      const code = e?.code || '';
      if (code === 'auth/user-not-found') {
        // Don't reveal whether an account exists; show the same success state.
        if (isMounted.current) {
          setResetSent(true);
          setError('');
        }
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later');
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Check your connection and try again');
      } else {
        setError('Something went wrong. Please try again');
      }
    } finally {
      if (isMounted.current) setResetting(false);
    }
  }, [resetting, email]);

  const handleSelectMode = useCallback((m: 'login' | 'register') => {
    setMode(m);
    setError('');
    setResetSent(false);
    // Clear all fields so register data doesn't bleed into login and vice versa.
    setPassword('');
    setDisplayName('');
    setUsername('');
    setCity('');
    setCitySearch('');
    setShowCities(false);
    setShowPassword(false);
  }, []);

  const toggleShowPassword = useCallback(() => setShowPassword((v) => !v), []);
  const handleUsernameChange = useCallback(
    (t: string) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, '')),
    []
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

  const submitLabel = mode === 'login' ? 'Sign In' : 'Create Account';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo Section ── */}
        <Animated.View
          style={[
            styles.logoSection,
            { opacity: logoOpacity, transform: [{ scale: logoScale }] },
          ]}
        >
          {/* Outer glow */}
          <View style={styles.logoOuterGlow}>
            {/* Ring */}
            <View style={styles.logoRing}>
              {/* Inner circle */}
              <View style={styles.logoCircle}>
                <Text style={styles.logoLetter} allowFontScaling={false}>
                  Q
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.appName}>Quorum</Text>
          <View style={styles.taglineRow}>
            <View style={styles.taglineDot} />
            <Text style={styles.tagline}>Plan together. Decide together.</Text>
            <View style={styles.taglineDot} />
          </View>
        </Animated.View>

        {/* ── Form Section ── */}
        <Animated.View
          style={[
            styles.formSection,
            { opacity: formOpacity, transform: [{ translateY: formTranslateY }] },
          ]}
        >
          {/* ── Tab Switcher ── */}
          <View style={styles.tabContainer}>
            {(['login', 'register'] as const).map((m) => {
              const isActive = mode === m;
              const label = m === 'login' ? 'Log In' : 'Register';
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.tab, isActive && styles.tabActive]}
                  onPress={() => handleSelectMode(m)}
                  activeOpacity={0.8}
                  disabled={loading}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={label}
                >
                  <Ionicons
                    name={
                      m === 'login'
                        ? isActive ? 'log-in' : 'log-in-outline'
                        : isActive ? 'person-add' : 'person-add-outline'
                    }
                    size={15}
                    color={isActive ? '#ffffff' : Colors.textSecondary}
                    style={styles.tabIcon}
                  />
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Form Card ── */}
          <View style={styles.formCard}>
            {mode === 'register' && (
              <>
                <GlassInput
                  icon="person-outline"
                  placeholder="Display Name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  maxLength={50}
                  textContentType="name"
                />
                <GlassInput
                  icon="at-outline"
                  placeholder="username"
                  value={username}
                  onChangeText={handleUsernameChange}
                  autoCapitalize="none"
                  maxLength={30}
                  textContentType="username"
                />
              </>
            )}

            <GlassInput
              icon="mail-outline"
              placeholder="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
            />

            <GlassInput
              icon="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              textContentType={mode === 'register' ? 'newPassword' : 'password'}
              returnKeyType="go"
              onSubmitEditing={mode === 'login' ? handleAuth : undefined}
              rightElement={
                <TouchableOpacity
                  onPress={toggleShowPassword}
                  style={styles.eyeBtn}
                  hitSlop={styles.eyeHitSlop}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={Colors.textSecondary}
                  />
                </TouchableOpacity>
              }
            />

            {mode === 'register' && password.length > 0 && (
              <PasswordStrengthBar password={password} />
            )}

            {mode === 'login' && (
              <View style={styles.forgotRow}>
                {resetSent ? (
                  <View style={styles.resetSentRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={Colors.success}
                      style={styles.resetSentIcon}
                    />
                    <Text style={styles.resetSentText}>Reset email sent. Check your inbox.</Text>
                  </View>
                ) : (
                  <AnimatedButton
                    label="Forgot password?"
                    onPress={handleForgotPassword}
                    variant="ghost"
                    size="sm"
                    loading={resetting}
                    disabled={resetting || loading}
                  />
                )}
              </View>
            )}

            {mode === 'register' && (
              <>
                {/* Country picker */}
                <View style={styles.sectionLabelRow}>
                  <Ionicons name="earth-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.sectionLabel}>Where are you located?</Text>
                </View>

                <TouchableOpacity
                  style={inputStyles.wrap}
                  onPress={openCountryPicker}
                  activeOpacity={0.8}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Select your country"
                >
                  <Ionicons name="globe-outline" size={18} color={Colors.textMuted} />
                  <Text
                    style={[
                      inputStyles.inputAsButton,
                      country ? styles.pickerValue : styles.pickerPlaceholder,
                    ]}
                  >
                    {country ? (country.name as string) : 'Select your country'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                {/* Hidden CountryPicker trigger */}
                <View style={styles.hiddenPicker}>
                  <CountryPicker
                    countryCode={countryCode}
                    withFilter
                    withFlag
                    withCountryNameButton
                    withAlphaFilter
                    visible={countryPickerVisible}
                    onClose={closeCountryPicker}
                    onSelect={handleSelectCountry}
                    theme={countryPickerTheme}
                  />
                </View>

                {/* City picker */}
                {country && (
                  <>
                    <View style={styles.sectionLabelRow}>
                      <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
                      <Text style={styles.sectionLabel}>City</Text>
                    </View>

                    <TouchableOpacity
                      style={inputStyles.wrap}
                      onPress={toggleCities}
                      activeOpacity={0.8}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityLabel="Select your city"
                    >
                      <Ionicons name="location-outline" size={18} color={Colors.textMuted} />
                      <Text
                        style={[
                          inputStyles.inputAsButton,
                          city ? styles.pickerValue : styles.pickerPlaceholder,
                        ]}
                      >
                        {city || 'Select your city'}
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
                          <Ionicons
                            name="search-outline"
                            size={16}
                            color={Colors.textMuted}
                            style={styles.citySearchIcon}
                          />
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
                        <ScrollView
                          style={styles.cityList}
                          keyboardShouldPersistTaps="handled"
                          nestedScrollEnabled
                        >
                          {filteredCities.length > 0 ? (
                            filteredCities.map((c) => (
                              <TouchableOpacity
                                key={c}
                                style={styles.cityItem}
                                onPress={() => handleSelectCity(c)}
                                accessibilityRole="button"
                                accessibilityLabel={c}
                              >
                                <Ionicons
                                  name="location-outline"
                                  size={14}
                                  color={Colors.textMuted}
                                  style={styles.cityItemIcon}
                                />
                                <Text style={styles.cityItemText}>{c}</Text>
                              </TouchableOpacity>
                            ))
                          ) : (
                            <View style={styles.cityEmpty}>
                              <Text style={styles.cityEmptyText}>No matching cities</Text>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    )}
                  </>
                )}
              </>
            )}

            {/* Error display */}
            {error ? (
              <View style={styles.errorRow} accessibilityLiveRegion="polite">
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={Colors.error}
                  style={styles.errorIcon}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <AnimatedButton
              label={submitLabel}
              onPress={handleAuth}
              variant="primary"
              size="lg"
              loading={loading}
              disabled={loading}
              style={styles.submitBtn}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// CountryPicker theme — hoisted so it isn't re-created every render.
const countryPickerTheme = {
  backgroundColor: Colors.surfaceRaised,
  onBackgroundTextColor: Colors.text,
  fontSize: FontSize.md,
  filterPlaceholderTextColor: Colors.textMuted,
  activeOpacity: 0.7,
  itemHeight: 44,
  flagSizeButton: 24,
  flagSize: 24,
};

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 60,
  },
  formSection: {
    width: '100%',
  },

  // ── Logo section ──
  logoSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoOuterGlow: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  logoRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.5,
    borderColor: Colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    fontSize: 38,
    fontWeight: FontWeight.heavy,
    color: '#ffffff',
    lineHeight: 44,
  },
  appName: {
    fontSize: FontSize.xxl + 6,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taglineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  tagline: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },

  // ── Tab switcher ──
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    gap: 6,
    minHeight: 44,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabIcon: {
    marginRight: 6,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: '#ffffff',
  },

  // ── Form card ──
  formCard: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  // ── Misc form elements ──
  eyeBtn: {
    paddingLeft: 6,
  },
  eyeHitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
  submitBtn: {
    marginTop: Spacing.xs,
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: -4,
  },
  resetSentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  resetSentIcon: {
    marginRight: 4,
  },
  resetSentText: {
    color: Colors.success,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },

  // ── Password strength ──
  strengthWrap: {
    gap: 4,
    marginTop: -4,
  },
  strengthBarRow: {
    flexDirection: 'row',
    gap: 3,
  },
  strengthSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },

  // ── Pickers (country / city) ──
  pickerValue: {
    color: Colors.text,
  },
  pickerPlaceholder: {
    color: Colors.textMuted,
  },
  hiddenPicker: {
    height: 0,
    overflow: 'hidden',
  },

  // ── Location section ──
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    marginBottom: -2,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },

  // ── City dropdown ──
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.background,
  },
  citySearchIcon: {
    marginRight: 8,
  },
  citySearchInput: {
    flex: 1,
    paddingVertical: 11,
    color: Colors.text,
    fontSize: FontSize.md,
  },
  cityList: {
    maxHeight: 220,
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    minHeight: 44,
  },
  cityItemIcon: {
    marginRight: 10,
  },
  cityItemText: {
    color: Colors.text,
    fontSize: FontSize.md,
  },
  cityEmpty: {
    paddingVertical: 16,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  cityEmptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },

  // ── Error ──
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.errorDim,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  errorIcon: {
    marginRight: 6,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
});
