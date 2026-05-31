import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

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
  const showing = useRef(false);

  const showNext = useCallback(() => {
    if (queue.current.length === 0 || showing.current) return;
    const next = queue.current.shift()!;
    showing.current = true;
    setCurrent(next);

    translateY.setValue(20);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();

    // Show longer for longer messages (min 2s, +40ms per char over 30, max 4.5s)
    const duration = Math.min(2000 + Math.max(0, next.message.length - 30) * 40, 4500);
    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setCurrent(null);
        showing.current = false;
        setTimeout(showNext, 80);
      });
    }, duration);
  }, []);

  const showToast = useCallback((msg: string, t: ToastType = 'success') => {
    queue.current.push({ message: msg, type: t });
    showNext();
  }, [showNext]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const bgColor =
    current?.type === 'error' ? Colors.errorDim :
    current?.type === 'info' ? Colors.primaryDim :
    Colors.successDim;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {current ? (
        <Animated.View
          style={[styles.toast, { backgroundColor: bgColor, opacity, transform: [{ translateY }] }]}
          pointerEvents="none"
        >
          <Ionicons
            name={current.type === 'error' ? 'alert-circle' : current.type === 'info' ? 'information-circle' : 'checkmark-circle'}
            size={18}
            color="#fff"
            style={{ marginRight: 7 }}
          />
          <Text style={styles.toastText}>{current.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.full,
    maxWidth: '88%',
    backgroundColor: Colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  toastText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
});
