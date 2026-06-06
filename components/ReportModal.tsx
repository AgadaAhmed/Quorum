import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../lib/firebase';
import { useToast } from './Toast';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

const REASONS = [
  'Scam / Fraud',
  'Misleading information',
  'Safety concern',
  'Fake or spam event',
  'Inappropriate content',
  'Other',
] as const;

interface Props {
  visible: boolean;
  planId: string;
  planTitle?: string;
  onClose: () => void;
}

interface ReasonOptionProps {
  reason: string;
  selected: boolean;
  onSelect: (reason: string) => void;
}

const ReasonOption = React.memo(function ReasonOption({
  reason,
  selected,
  onSelect,
}: ReasonOptionProps) {
  const handlePress = useCallback(() => onSelect(reason), [onSelect, reason]);
  return (
    <TouchableOpacity
      style={[styles.option, selected && styles.optionSelected]}
      onPress={handlePress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={reason}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{reason}</Text>
    </TouchableOpacity>
  );
});

export default function ReportModal({ visible, planId, planTitle, onClose }: Props) {
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const handleClose = useCallback(() => {
    setSelected('');
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!selected || submitting) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      showToast('You must be signed in to report.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        planId,
        reporterId: uid,
        reason: selected,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      showToast("Report submitted — we'll review it shortly.");
      setSelected('');
      onClose();
    } catch {
      showToast('Failed to submit report', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, planId, showToast, onClose]);

  const submitDisabled = !selected || submitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Ionicons name="flag-outline" size={20} color={Colors.text} style={styles.headerIcon} />
            <Text style={styles.title}>Report Event</Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          {planTitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              &quot;{planTitle}&quot;
            </Text>
          ) : null}
          <Text style={styles.label}>What&apos;s the issue?</Text>
          {REASONS.map((r) => (
            <ReasonOption key={r} reason={r} selected={selected === r} onSelect={setSelected} />
          ))}
          <TouchableOpacity
            style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitDisabled}
            accessibilityRole="button"
            accessibilityLabel="Submit report"
            accessibilityState={{ disabled: submitDisabled }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <Text style={styles.submitText}>Submit Report</Text>
            )}
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  headerIcon: {
    marginRight: 8,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    flex: 1,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
    fontStyle: 'italic',
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  optionSelected: {
    backgroundColor: Colors.primaryDim,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  optionText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  optionTextSelected: {
    color: Colors.text,
    fontWeight: FontWeight.semibold,
  },
  submitBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: Colors.background,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.md,
  },
});
