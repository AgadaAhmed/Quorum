import React from 'react';
import { Linking, Modal, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from '../Toast';
import { Colors, FontSize, Radius, Spacing } from '../../lib/theme';

export default function SOSModal({
  visible, onClose, plan, emergencyContact,
}: {
  visible: boolean;
  onClose: () => void;
  plan: any;
  emergencyContact: { name: string; phone: string } | null;
}) {
  const { showToast } = useToast();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Ionicons name="shield-outline" size={28} color={Colors.error} />
            <Text style={styles.title}>Emergency SOS</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>CURRENT PLAN</Text>
            <Text style={styles.infoValue}>{plan?.title}</Text>
            {plan?.location ? (
              <Text style={styles.infoSub}>
                {plan.location}
              </Text>
            ) : null}
            {plan?.date ? (
              <Text style={styles.infoSub}>
                {plan.date}
              </Text>
            ) : null}
          </View>
          {emergencyContact ? (
            <View style={styles.contactCard}>
              <Text style={styles.infoLabel}>EMERGENCY CONTACT</Text>
              <Text style={styles.contactName}>{emergencyContact.name}</Text>
              <Text style={styles.contactPhone}>{emergencyContact.phone}</Text>
            </View>
          ) : (
            <Text style={styles.noContact}>No emergency contact set. Add one in your Profile.</Text>
          )}
          <TouchableOpacity
            style={[styles.copyBtn, !plan?.location && styles.dim]}
            disabled={!plan?.location}
            onPress={() => {
              const msg = `I'm at "${plan?.title}"${plan?.location ? ` (${plan.location})` : ''}. Sent via Quorum SOS.`;
              Share.share({ message: msg }).catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel="Share location"
          >
            <Ionicons name="copy-outline" size={18} color={Colors.text} style={styles.iconMr8} />
            <Text style={styles.copyBtnText}>Share Location</Text>
          </TouchableOpacity>
          {emergencyContact?.phone ? (
            <TouchableOpacity
              style={styles.callBtn}
              onPress={() => Linking.openURL(`tel:${emergencyContact.phone}`).catch(() => showToast('Unable to start call', 'error'))}
              accessibilityRole="button"
              accessibilityLabel={`Call ${emergencyContact.name}`}
            >
              <Ionicons name="call-outline" size={18} color={Colors.background} style={styles.iconMr8} />
              <Text style={styles.callBtnText}>Call {emergencyContact.name}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.4 },
  iconMr8: { marginRight: 8 },
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceRaised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.md,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.error,
  },
  infoCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  infoSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  contactCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.error + '44',
  },
  contactName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  contactPhone: {
    fontSize: FontSize.md,
    color: Colors.primary,
    marginTop: 2,
  },
  noContact: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.full,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  copyBtnText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.error,
    borderRadius: Radius.full,
    paddingVertical: 14,
    marginBottom: 10,
  },
  callBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.background,
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  closeBtnText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
});
