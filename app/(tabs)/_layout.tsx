import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { Colors, FontSize, Radius, Shadow } from '../../lib/theme';

const TABS = [
  { name: 'index',    label: 'Home',     icon: 'home-outline' as const,          iconActive: 'home' as const },
  { name: 'discover', label: 'Discover', icon: 'compass-outline' as const,       iconActive: 'compass' as const },
  { name: 'activity', label: 'Activity', icon: 'notifications-outline' as const, iconActive: 'notifications' as const },
  { name: 'profile',  label: 'Profile',  icon: 'person-outline' as const,        iconActive: 'person' as const },
];

function CustomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      const d = snap.data();
      setBadge(d?.friendRequests?.length || 0);
    });
    return unsub;
  }, []);

  const activeRoute = (name: string) => {
    if (name === 'index') return pathname === '/' || pathname === '/index';
    return pathname.startsWith(`/${name}`);
  };

  return (
    <View style={[styles.barWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {/* Left two tabs */}
        {TABS.slice(0, 2).map((tab) => (
          <TabBtn
            key={tab.name}
            tab={tab}
            isActive={activeRoute(tab.name)}
            badge={tab.name === 'activity' ? badge : 0}
            onPress={() => router.push(tab.name === 'index' ? '/' : `/${tab.name}`)}
          />
        ))}

        {/* Center create button */}
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/create-plan');
          }}
          activeOpacity={0.85}
          accessibilityLabel="Create new plan"
          accessibilityRole="button"
        >
          <View style={styles.createInner}>
            <Ionicons name="add" size={28} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Right two tabs */}
        {TABS.slice(2).map((tab) => (
          <TabBtn
            key={tab.name}
            tab={tab}
            isActive={activeRoute(tab.name)}
            badge={tab.name === 'activity' ? badge : 0}
            onPress={() => router.push(`/${tab.name}`)}
          />
        ))}
      </View>
    </View>
  );
}

function TabBtn({
  tab,
  isActive,
  badge,
  onPress,
}: {
  tab: (typeof TABS)[0];
  isActive: boolean;
  badge: number;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const press = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, speed: 80, bounciness: 2 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 14 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity style={styles.tab} onPress={press} activeOpacity={1}>
      <Animated.View style={[styles.iconWrap, isActive && styles.iconWrapActive, { transform: [{ scale }] }]}>
        <Ionicons
          name={isActive ? tab.iconActive : tab.icon}
          size={22}
          color={isActive ? Colors.primary : Colors.textMuted}
        />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </Animated.View>
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={() => <CustomTabBar />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
    ...Shadow.dark,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  iconWrap: {
    width: 44,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: Colors.primaryDim,
    ...Shadow.rose,
  },
  tabLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 3,
    backgroundColor: Colors.error,
    borderRadius: 99,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  createBtn: {
    width: 64,
    alignItems: 'center',
    marginTop: -18,
  },
  createInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.roseStrong,
    borderWidth: 2,
    borderColor: Colors.primaryLight + '55',
  },
});
