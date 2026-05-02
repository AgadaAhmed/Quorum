import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChanged, User } from 'firebase/auth';
import Constants from 'expo-constants';
import { doc, updateDoc } from 'firebase/firestore';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { auth, db } from '../lib/firebase';
import { Colors } from '../lib/theme';
import { ToastProvider } from '../components/Toast';
import { RC_API_KEY_IOS, RC_API_KEY_ANDROID } from '../lib/subscription';

// Push notifications were removed from Expo Go in SDK 53.
// Only load expo-notifications in standalone/production builds.
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  // Dynamic require avoids the module-level side-effect that crashes Expo Go
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
  const Device = require('expo-device');
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
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={splashStyles.container}>
      <Animated.View style={[splashStyles.logoWrap, { transform: [{ scale }], opacity }]}>
        <View style={splashStyles.glow} />
        <View style={splashStyles.ring}>
          <View style={splashStyles.circle}>
            <Text style={splashStyles.letter}>Q</Text>
          </View>
        </View>
      </Animated.View>
      <Animated.Text style={[splashStyles.appName, { opacity }]}>Quorum</Animated.Text>
      <Animated.Text style={[splashStyles.tagline, { opacity }]}>Plan together. Decide together.</Animated.Text>
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: 16 },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: Colors.primaryGlow },
  ring: { width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, borderColor: Colors.primaryBorder, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 84, height: 84, borderRadius: 42, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 12 },
  letter: { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  appName: { fontSize: 32, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: Colors.textMuted, fontWeight: '500' },
});

export default function RootLayout() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
    Purchases.setLogLevel(LOG_LEVEL.VERBOSE); // remove before production
    Purchases.configure({ apiKey });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) registerPushToken(u.uid);
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
  }, [user, segments]);

  useEffect(() => {
    if (isExpoGo) return;
    const Notifications = require('expo-notifications');
    const sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const planId = response.notification.request.content.data?.planId as string | undefined;
      if (planId) router.push({ pathname: '/plan-detail', params: { id: planId } });
    });
    return () => sub.remove();
  }, []);

  if (user === undefined) return <SplashScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <StatusBar style="light" backgroundColor={Colors.background} />
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
