import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ICONS: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

export const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const queue = useRef<ToastItem[]>([]);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showing = useRef(false);
  const mounted = useRef(true);

  const showNext = useCallback(() => {
    if (!mounted.current || queue.current.length === 0 || showing.current) return;
    const next = queue.current.shift()!;
    showing.current = true;
    setCurrent(next);

    translateY.setValue(20);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();

    // Announce for screen readers.
    AccessibilityInfo.announceForAccessibility?.(next.message);

    // Show longer for longer messages (min 2s, +40ms per char over 30, max 4.5s)
    const duration = Math.min(2000 + Math.max(0, next.message.length - 30) * 40, 4500);
    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        if (!mounted.current) return;
        setCurrent(null);
        showing.current = false;
        gapTimer.current = setTimeout(showNext, 80);
      });
    }, duration);
  }, [opacity, translateY]);

  const showToast = useCallback(
    (msg: string, t: ToastType = 'success') => {
      if (!msg) return;
      queue.current.push({ message: msg, type: t });
      showNext();
    },
    [showNext]
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (gapTimer.current) clearTimeout(gapTimer.current);
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current ? (
        <Animated.View
          style={[styles.toast, { opacity, transform: [{ translateY }] }]}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Ionicons name={ICONS[current.type]} size={18} color={Colors.background} style={styles.icon} />
          <Text style={styles.toastText} numberOfLines={3}>
            {current.message}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: Spacing.xl,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    maxWidth: '88%',
    // Solid dark surface keeps light text legible for every toast type;
    // the icon (not color) signals success / error / info.
    backgroundColor: Colors.primaryContainer,
    borderWidth: 1,
    borderColor: Colors.glassBorderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  icon: {
    marginRight: Spacing.xs + 3,
  },
  toastText: {
    flexShrink: 1,
    color: Colors.background,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
});
