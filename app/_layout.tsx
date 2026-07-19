import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChanged, User } from 'firebase/auth';
import Constants from 'expo-constants';
import { doc, updateDoc } from 'firebase/firestore';
import Purchases from 'react-native-purchases';
import { auth, db } from '../lib/firebase';
import { Colors } from '../lib/theme';
import { ToastProvider } from '../components/Toast';
import { RC_API_KEY_IOS, RC_API_KEY_ANDROID } from '../lib/subscription';

// Push notifications were removed from Expo Go in SDK 53.
// Only load expo-notifications in standalone/production builds.
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  // Dynamic require avoids the module-level side-effect that crashes Expo Go
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function registerPushToken(uid: string) {
  if (isExpoGo) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Device = require('expo-device');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require('expo-notifications');
  if (!Device.isDevice) return;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await updateDoc(doc(db, 'users', uid), { pushToken: token });
  } catch {}
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

function SplashScreen() {
  const scale = useRef(new Animated.Value(0.72)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 55, friction: 8, useNativeDriver: true }),
      Animated.spring(ringScale, { toValue: 1, tension: 40, friction: 10, delay: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [scale, ringScale, opacity]);

  return (
    <View style={splashStyles.container}>
      <Animated.View style={[splashStyles.logoWrap, { transform: [{ scale }], opacity }]}>
        {/* Outer ring */}
        <Animated.View style={[splashStyles.outerRing, { transform: [{ scale: ringScale }] }]} />
        {/* Glow */}
        <View style={splashStyles.glow} />
        {/* Icon circle */}
        <View style={splashStyles.circle}>
          <Text style={splashStyles.letter}>Q</Text>
        </View>
      </Animated.View>
      <Animated.View style={[{ alignItems: 'center', gap: 6 }, { opacity }]}>
        <Text style={splashStyles.appName}>Quorum</Text>
        <Text style={splashStyles.tagline}>Plan together. Decide together.</Text>
      </Animated.View>
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: 28 },
  logoWrap: { alignItems: 'center', justifyContent: 'center', width: 120, height: 120 },
  outerRing: {
    position: 'absolute', width: 116, height: 116, borderRadius: 58,
    borderWidth: 1, borderColor: Colors.primaryBorder,
  },
  glow: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.primaryGlow,
  },
  circle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55, shadowRadius: 24, elevation: 14,
  },
  letter: { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  appName: { fontSize: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: Colors.textMuted, fontWeight: '500', letterSpacing: 0.1 },
});

export default function RootLayout() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isExpoGo) return;
    const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
    Purchases.configure({ apiKey });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        registerPushToken(u.uid);
        // Identify the user to RevenueCat so its app_user_id == Firebase uid.
        // The revenuecatWebhook keys on app_user_id to write the correct user's
        // subscriptionTier; without this it would use an anonymous id.
        if (!isExpoGo) Purchases.logIn(u.uid).catch(() => {});
      } else if (!isExpoGo) {
        Purchases.logOut().catch(() => {});
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (user === undefined) return;
    const inAuth = segments[0] === '(auth)';
    const inTabs = segments[0] === '(tabs)';
    // These are valid authenticated routes — don't redirect away from them
    const inModal = ['plan-detail', 'create-plan', 'chat', 'social', 'settings', 'user-profile'].includes(segments[0] as string);

    if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      router.replace('/(tabs)');
    } else if (user && !inTabs && !inAuth && !inModal) {
      router.replace('/(tabs)');
    }
  }, [user, segments, router]);

  useEffect(() => {
    if (isExpoGo) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications');
    const sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const planId = response.notification.request.content.data?.planId as string | undefined;
      if (planId) router.push({ pathname: '/plan-detail', params: { id: planId } });
    });
    return () => sub.remove();
  }, [router]);

  if (user === undefined) return <SplashScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <StatusBar style="dark" backgroundColor={Colors.background} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background }, animation: 'slide_from_right' }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="plan-detail" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
            <Stack.Screen name="create-plan" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
            <Stack.Screen name="chat" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="social" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="user-profile" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
