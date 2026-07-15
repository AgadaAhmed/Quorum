import React, { useCallback, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import AnimatedButton from './AnimatedButton';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

// Lazy require — avoids DevicePushTokenAutoRegistration.fx.js side-effect crash in Expo Go
// eslint-disable-next-line @typescript-eslint/no-require-imports
const getNotifications = () => require('expo-notifications') as typeof import('expo-notifications');

type DurationOption = { label: string; ms: number };

const HOUR_MS = 60 * 60 * 1000;

const DURATION_OPTIONS: DurationOption[] = [
  { label: '1h', ms: HOUR_MS },
  { label: '2h', ms: 2 * HOUR_MS },
  { label: '3h', ms: 3 * HOUR_MS },
  { label: '4h', ms: 4 * HOUR_MS },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onStarted: (notifId: string, endsAt: number) => void;
  planTitle: string;
  planId: string;
};

interface DurationPillProps {
  option: DurationOption;
  active: boolean;
  onSelect: (option: DurationOption) => void;
}

const DurationPill = React.memo(function DurationPill({
  option,
  active,
  onSelect,
}: DurationPillProps) {
  const handlePress = useCallback(() => onSelect(option), [onSelect, option]);
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={handlePress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${option.label} timer`}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{option.label}</Text>
    </TouchableOpacity>
  );
});

export default function SafetyTimerModal({
  visible,
  onClose,
  onStarted,
  planTitle,
  planId,
}: Props) {
  const [selectedDuration, setSelectedDuration] = useState<DurationOption>(DURATION_OPTIONS[1]);
  const [starting, setStarting] = useState(false);

  const handleStart = useCallback(async () => {
    if (starting) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setStarting(true);
    try {
      const endsAt = Date.now() + selectedDuration.ms;
      const N = getNotifications();
      const notificationId = await N.scheduleNotificationAsync({
        content: {
          title: 'Safety Check-In',
          body: `You were attending "${planTitle}". Are you okay? Open Quorum to confirm.`,
          data: { planId },
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DATE,
          date: new Date(endsAt),
        },
      });
      await updateDoc(doc(db, 'users', uid), {
        safetyTimer: { notificationId, endsAt },
      });
      onStarted(notificationId, endsAt);
      onClose();
    } catch {
      // silently fail — timer won't be set
    } finally {
      setStarting(false);
    }
  }, [starting, selectedDuration, planTitle, planId, onStarted, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Ionicons
              name="shield-outline"
              size={22}
              color={Colors.text}
              style={styles.titleIcon}
            />
            <Text style={styles.title}>Safety Check-In Timer</Text>
          </View>
          <Text style={styles.subtitle}>
            We&apos;ll send you a notification when the timer ends to confirm you&apos;re safe.
          </Text>
          <Text style={styles.label}>Timer duration</Text>
          <View style={styles.pillRow}>
            {DURATION_OPTIONS.map((opt) => (
              <DurationPill
                key={opt.label}
                option={opt}
                active={selectedDuration.label === opt.label}
                onSelect={setSelectedDuration}
              />
            ))}
          </View>
          <AnimatedButton
            label={starting ? 'Starting...' : 'Start Timer'}
            onPress={handleStart}
            variant="primary"
            loading={starting}
            disabled={starting}
          />
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  titleIcon: {
    marginRight: 8,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  pill: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: Colors.primaryDim,
    borderColor: Colors.primary,
  },
  pillText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: Colors.text,
  },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: Spacing.xs,
  },
  cancelText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
});
