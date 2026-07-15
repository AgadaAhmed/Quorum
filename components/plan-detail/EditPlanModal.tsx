import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../Toast';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';
import { CATEGORIES } from './shared';

export default function EditPlanModal({
  visible, onClose, plan, uid,
}: {
  visible: boolean;
  onClose: () => void;
  plan: any;
  uid: string;
}) {
  const { showToast } = useToast();
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editUsingCustomCategory, setEditUsingCustomCategory] = useState(false);
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed the form from the current plan each time the modal opens.
  useEffect(() => {
    if (!visible || !plan) return;
    setEditTitle(plan.title);
    setEditDesc(plan.description || '');
    setEditLocation(plan.location || '');
    setEditDate(plan.dateTimestamp ? new Date(plan.dateTimestamp) : null);
    setEditCategory(plan.category || '');
    setEditUsingCustomCategory(!!plan.category && !CATEGORIES.includes(plan.category));
    setEditIsPublic(plan.isPublic ?? true);
    setShowEditDatePicker(false);
  }, [visible, plan]);

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    if (plan.createdBy !== uid) { showToast('Only the creator can edit this plan', 'error'); return; }
    setSaving(true);
    const dateStr = editDate
      ? editDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : plan.date || '';
    try {
      await updateDoc(doc(db, 'plans', plan.id), {
        title: editTitle.trim().slice(0, 80),
        description: editDesc.trim().slice(0, 500),
        location: editLocation.trim().slice(0, 150),
        date: dateStr,
        category: editCategory.trim() || null,
        isPublic: editIsPublic,
      });
      onClose();
      showToast('Plan updated!');
    } catch {
      showToast('Failed to update plan', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Plan</Text>
            <TextInput
              style={styles.modalInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Title"
              placeholderTextColor={Colors.textMuted}
              maxLength={80}
            />
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="Description"
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={500}
            />
            <TextInput
              style={styles.modalInput}
              value={editLocation}
              onChangeText={setEditLocation}
              placeholder="Location"
              placeholderTextColor={Colors.textMuted}
              maxLength={150}
            />
            <TouchableOpacity style={styles.modalInput} onPress={() => setShowEditDatePicker(true)}>
              <Text style={{ color: editDate ? Colors.text : Colors.textMuted }}>
                {editDate
                  ? editDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                  : plan?.date || 'Pick a date'}
              </Text>
            </TouchableOpacity>
            {Platform.OS === 'android' && showEditDatePicker && (
              <DateTimePicker
                value={editDate || new Date()}
                mode="date"
                minimumDate={new Date()}
                onChange={(_, d) => { setShowEditDatePicker(false); if (d) setEditDate(d); }}
              />
            )}
            {Platform.OS === 'ios' && showEditDatePicker && (
              <DateTimePicker
                value={editDate || new Date()}
                mode="date"
                minimumDate={new Date()}
                display="spinner"
                onChange={(_, d) => { if (d) setEditDate(d); }}
                style={{ backgroundColor: Colors.background }}
              />
            )}

            <Text style={styles.modalLabel}>Category</Text>
            <View style={styles.catRow}>
              <TouchableOpacity
                style={[styles.catChip, !editCategory && !editUsingCustomCategory && styles.catChipActive]}
                onPress={() => { setEditCategory(''); setEditUsingCustomCategory(false); }}
              >
                <Text style={[styles.catChipText, !editCategory && !editUsingCustomCategory && styles.catChipTextActive]}>None</Text>
              </TouchableOpacity>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.catChip, editCategory === c && !editUsingCustomCategory && styles.catChipActive]}
                  onPress={() => { setEditUsingCustomCategory(false); setEditCategory(c); }}
                >
                  <Text style={[styles.catChipText, editCategory === c && !editUsingCustomCategory && styles.catChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.catChip, editUsingCustomCategory && styles.catChipActive]}
                onPress={() => { setEditUsingCustomCategory(true); setEditCategory(''); }}
              >
                <Text style={[styles.catChipText, editUsingCustomCategory && styles.catChipTextActive]}>Custom</Text>
              </TouchableOpacity>
            </View>
            {editUsingCustomCategory && (
              <TextInput
                style={styles.modalInput}
                value={editCategory}
                onChangeText={setEditCategory}
                placeholder="e.g. Hiking, Coding, Book Club..."
                placeholderTextColor={Colors.textMuted}
                autoFocus
                maxLength={40}
              />
            )}

            <Text style={styles.modalLabel}>Visibility</Text>
            <View style={styles.visibilityRow}>
              <TouchableOpacity
                style={[styles.visibilityBtn, editIsPublic && styles.visibilityBtnActive]}
                onPress={() => setEditIsPublic(true)}
              >
                <Text style={[styles.visibilityBtnText, editIsPublic && styles.visibilityBtnTextActive]}>Public</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.visibilityBtn, !editIsPublic && styles.visibilityBtnActive]}
                onPress={() => setEditIsPublic(false)}
              >
                <Text style={[styles.visibilityBtnText, !editIsPublic && styles.visibilityBtnTextActive]}>Private</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, (saving || !editTitle.trim()) && styles.dim]}
                onPress={handleSaveEdit}
                disabled={saving || !editTitle.trim()}
                accessibilityRole="button"
                accessibilityLabel="Save plan changes"
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.4 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  modalContent: {
    backgroundColor: Colors.backgroundAlt,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm, paddingBottom: Spacing.xl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.text, marginBottom: Spacing.xs },
  modalInput: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 12,
    color: Colors.text, fontSize: FontSize.md, justifyContent: 'center',
  },
  modalLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  visibilityRow: { flexDirection: 'row', gap: 10 },
  visibilityBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  visibilityBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  visibilityBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.sm },
  visibilityBtnTextActive: { color: Colors.background, fontWeight: '700' },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  catChipTextActive: { color: Colors.background, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  modalCancel: {
    flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.borderStrong,
  },
  modalCancelText: { color: Colors.textSecondary, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  modalSave: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full, backgroundColor: Colors.primary },
  modalSaveText: { color: Colors.background, fontWeight: FontWeight.bold, fontSize: FontSize.md },
});
