import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
// Lazy require — avoids DevicePushTokenAutoRegistration.fx.js side-effect crash in Expo Go
const getNotifications = () => require('expo-notifications') as typeof import('expo-notifications');
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import AnimatedButton from './AnimatedButton';
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

const DURATION_OPTIONS = [
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '2h', ms: 2 * 60 * 60 * 1000 },
  { label: '3h', ms: 3 * 60 * 60 * 1000 },
  { label: '4h', ms: 4 * 60 * 60 * 1000 },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onStarted: (notifId: string, endsAt: number) => void;
  planTitle: string;
  planId: string;
};

export default function SafetyTimerModal({ visible, onClose, onStarted, planTitle, planId }: Props) {
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[1]);
  const [starting, setStarting] = useState(false);

  const uid = auth.currentUser?.uid || '';

  const handleStart = async () => {
    if (starting) return;
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
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        safetyTimer: { notificationId, endsAt },
      });
      onStarted(notificationId, endsAt);
      onClose();
    } catch {
      // silently fail — timer won't be set
    } finally {
      setStarting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Ionicons name="shield-outline" size={22} color={Colors.success} style={{ marginRight: 8 }} />
            <Text style={styles.title}>Safety Check-In Timer</Text>
          </View>
          <Text style={styles.subtitle}>
            We'll send you a notification when the timer ends to confirm you're safe.
          </Text>
          <Text style={styles.label}>Timer duration</Text>
          <View style={styles.pillRow}>
            {DURATION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[styles.pill, selectedDuration.label === opt.label && styles.pillActive]}
                onPress={() => setSelectedDuration(opt)}
              >
                <Text style={[styles.pillText, selectedDuration.label === opt.label && styles.pillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <AnimatedButton
            label={starting ? 'Starting...' : 'Start Timer'}
            onPress={handleStart}
            variant="primary"
            loading={starting}
            disabled={starting}
          />
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
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
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '800',
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
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  pillActive: {
    backgroundColor: Colors.success + '22',
    borderColor: Colors.success,
  },
  pillText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: Colors.success,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
});
