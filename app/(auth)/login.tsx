import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
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
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../lib/theme';
import AnimatedButton from '../../components/AnimatedButton';

// ── GlassInput ──────────────────────────────────────────────────────────────
function GlassInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  editable,
  rightElement,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  editable?: boolean;
  rightElement?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
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
        editable={editable !== false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={inputStyles.input}
      />
      {rightElement}
    </View>
  );
}

const inputStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  wrapFocused: {
    borderColor: Colors.primaryBorder,
    backgroundColor: Colors.primaryDim,
  },
  wrapDisabled: { opacity: 0.5 },
  input: { flex: 1, color: Colors.text, fontSize: FontSize.md },
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
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Animations
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(32)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(formTranslateY, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const allCities = getCities(countryCode);
  const filteredCities = citySearch.trim()
    ? allCities.filter((c) => c.toLowerCase().includes(citySearch.toLowerCase()))
    : allCities;

  // ── Auth handlers ───────────────────────────────────────────────────────
  const handleAuth = async () => {
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!username.trim()) {
          setError('Username is required');
          setLoading(false);
          return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
          setError('Username can only contain letters, numbers, and underscores');
          setLoading(false);
          return;
        }
        if (!country) {
          setError('Please select your country');
          setLoading(false);
          return;
        }
        const taken = await getDocs(
          query(collection(db, 'users'), where('usernameLower', '==', username.trim().toLowerCase()))
        );
        if (!taken.empty) {
          const base = username.trim().replace(/\d+$/, '');
          const suggestions = [base + '1', base + '2', base + '_' + Math.floor(Math.random() * 99 + 1)];
          setError(`Username taken. Try: ${suggestions.join(', ')}`);
          setLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          displayName,
          username: username.trim(),
          usernameLower: username.trim().toLowerCase(),
          email,
          country: country.name || countryCode,
          countryCode,
          city,
          createdAt: serverTimestamp(),
          friends: [],
        });
      }
      router.replace('/(tabs)/');
    } catch (e: any) {
      setError(e.message?.replace('Firebase: ', '') || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email above first, then tap Forgot Password');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
      setError('');
    } catch (e: any) {
      setError(e.message?.replace('Firebase: ', '') || 'Could not send reset email');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
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
                <Text style={styles.logoLetter}>Q</Text>
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
          style={{
            opacity: formOpacity,
            transform: [{ translateY: formTranslateY }],
          }}
        >
          {/* ── Tab Switcher ── */}
          <View style={styles.tabContainer}>
            {(['login', 'register'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.tab, mode === m && styles.tabActive]}
                onPress={() => {
                  setMode(m);
                  setError('');
                  setResetSent(false);
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={
                    m === 'login'
                      ? mode === m ? 'log-in' : 'log-in-outline'
                      : mode === m ? 'person-add' : 'person-add-outline'
                  }
                  size={15}
                  color={mode === m ? Colors.text : Colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                  {m === 'login' ? 'Log In' : 'Register'}
                </Text>
              </TouchableOpacity>
            ))}
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
                />
                <GlassInput
                  icon="at-outline"
                  placeholder="username"
                  value={username}
                  onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''))}
                  autoCapitalize="none"
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
            />

            <GlassInput
              icon="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              rightElement={
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={Colors.textSecondary}
                  />
                </TouchableOpacity>
              }
            />

            {mode === 'register' && (
              <View style={styles.hintRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={13}
                  color={Colors.textMuted}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.hintText}>
                  At least 6 characters. Use letters, numbers, or symbols.
                </Text>
              </View>
            )}

            {mode === 'login' && (
              <View style={styles.forgotRow}>
                {resetSent ? (
                  <View style={styles.resetSentRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={Colors.success}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.resetSentText}>Reset email sent! Check your inbox.</Text>
                  </View>
                ) : (
                  <AnimatedButton
                    label="Forgot password?"
                    onPress={handleForgotPassword}
                    variant="ghost"
                    size="sm"
                  />
                )}
              </View>
            )}

            {mode === 'register' && (
              <>
                {/* Country picker */}
                <Text style={styles.sectionLabel}>
                  <Ionicons name="earth-outline" size={13} color={Colors.textSecondary} />
                  {'  '}Where are you located?
                </Text>

                <TouchableOpacity
                  style={inputStyles.wrap}
                  onPress={() => setCountryPickerVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="globe-outline" size={18} color={Colors.textMuted} />
                  <Text
                    style={[
                      inputStyles.input,
                      { paddingVertical: 0, color: country ? Colors.text : Colors.textMuted },
                    ]}
                  >
                    {country ? (country.name as string) : 'Select your country'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                {/* Hidden CountryPicker trigger */}
                <View style={{ height: 0, overflow: 'hidden' }}>
                  <CountryPicker
                    countryCode={countryCode}
                    withFilter
                    withFlag
                    withCountryNameButton
                    withAlphaFilter
                    visible={countryPickerVisible}
                    onClose={() => setCountryPickerVisible(false)}
                    onSelect={(c: Country) => {
                      setCountryCode(c.cca2);
                      setCountry(c);
                      setCity('');
                      setCitySearch('');
                      setShowCities(false);
                      setCountryPickerVisible(false);
                    }}
                    theme={{
                      backgroundColor: Colors.surfaceRaised,
                      onBackgroundTextColor: Colors.text,
                      fontSize: FontSize.md,
                      filterPlaceholderTextColor: Colors.textMuted,
                      activeOpacity: 0.7,
                      itemHeight: 44,
                      flagSizeButton: 24,
                      flagSize: 24,
                    }}
                  />
                </View>

                {/* City picker */}
                {country && (
                  <>
                    <Text style={styles.sectionLabel}>
                      <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
                      {'  '}City
                    </Text>

                    <TouchableOpacity
                      style={inputStyles.wrap}
                      onPress={() => setShowCities(!showCities)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="location-outline" size={18} color={Colors.textMuted} />
                      <Text
                        style={[
                          inputStyles.input,
                          { paddingVertical: 0, color: city ? Colors.text : Colors.textMuted },
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
                            style={{ marginRight: 8 }}
                          />
                          <TextInput
                            style={styles.citySearchInput}
                            placeholder="Search cities..."
                            placeholderTextColor={Colors.textMuted}
                            value={citySearch}
                            onChangeText={setCitySearch}
                            autoFocus
                          />
                        </View>
                        <ScrollView
                          style={{ maxHeight: 220 }}
                          keyboardShouldPersistTaps="handled"
                          nestedScrollEnabled
                        >
                          {(filteredCities.length > 0 ? filteredCities : ['Other']).map((c) => (
                            <TouchableOpacity
                              key={c}
                              style={styles.cityItem}
                              onPress={() => {
                                setCity(c);
                                setShowCities(false);
                                setCitySearch('');
                              }}
                            >
                              <Ionicons
                                name="location-outline"
                                size={14}
                                color={Colors.textMuted}
                                style={{ marginRight: 10 }}
                              />
                              <Text style={styles.cityItemText}>{c}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </>
                )}
              </>
            )}

            {/* Error display */}
            {error ? (
              <View style={styles.errorRow}>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={Colors.error}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <AnimatedButton
              label={loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              onPress={handleAuth}
              variant="primary"
              size="lg"
              disabled={loading}
              style={{ marginTop: 4 }}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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

  // ── Logo section ──
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoOuterGlow: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: Colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 32,
    elevation: 16,
  },
  logoRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.5,
    borderColor: Colors.primary + '90',
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
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  logoLetter: {
    fontSize: 38,
    fontWeight: FontWeight.heavy,
    color: '#fff',
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
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },

  // ── Tab switcher ──
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.full,
    padding: 4,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  tabActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 5,
  },
  tabText: {
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.md,
  },
  tabTextActive: {
    color: Colors.text,
  },

  // ── Form card ──
  formCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },

  // ── Misc form elements ──
  eyeBtn: {
    paddingLeft: 6,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -2,
  },
  hintText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    flex: 1,
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: -4,
  },
  resetSentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resetSentText: {
    color: Colors.success,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },

  // ── Location section ──
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    marginBottom: -2,
    marginTop: 2,
  },

  // ── City dropdown ──
  cityDropdown: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.glassBorderStrong,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  citySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.background,
  },
  citySearchInput: {
    flex: 1,
    paddingVertical: 11,
    color: Colors.text,
    fontSize: FontSize.md,
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
  },
  cityItemText: {
    color: Colors.text,
    fontSize: FontSize.md,
  },

  // ── Error ──
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.error + '15',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.error + '40',
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    flex: 1,
  },
});
