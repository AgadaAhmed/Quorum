import React, { useState } from 'react';
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
import { Colors, FontSize, Radius, Spacing } from '../lib/theme';

const REASONS = [
  'Scam / Fraud',
  'Misleading information',
  'Safety concern',
  'Fake or spam event',
  'Inappropriate content',
  'Other',
];

interface Props {
  visible: boolean;
  planId: string;
  planTitle?: string;
  onClose: () => void;
}

export default function ReportModal({ visible, planId, planTitle, onClose }: Props) {
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();
  const uid = auth.currentUser?.uid || '';

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        planId,
        reporterId: uid,
        reason: selected,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      showToast('Report submitted — we\'ll review it shortly.');
      setSelected('');
      onClose();
    } catch {
      showToast('Failed to submit report', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Ionicons name="flag-outline" size={20} color={Colors.error} style={{ marginRight: 8 }} />
            <Text style={styles.title}>Report Event</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          {planTitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>"{planTitle}"</Text>
          ) : null}
          <Text style={styles.label}>What's the issue?</Text>
          {REASONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.option, selected === r && styles.optionSelected]}
              onPress={() => setSelected(r)}
            >
              <View style={[styles.radio, selected === r && styles.radioSelected]}>
                {selected === r && <View style={styles.radioDot} />}
              </View>
              <Text style={[styles.optionText, selected === r && styles.optionTextSelected]}>{r}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.submitBtn, (!selected || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!selected || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.text} />
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
    paddingBottom: 40,
    paddingTop: 12,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: 4,
    gap: 12,
  },
  optionSelected: {
    backgroundColor: Colors.error + '15',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.error,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
  },
  optionText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: Colors.text,
    fontWeight: '600',
  },
  submitBtn: {
    marginTop: 16,
    backgroundColor: Colors.error,
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
});
