import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Purchases from 'react-native-purchases';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { RC_MONTHLY_PRODUCT_ID, RC_ANNUAL_PRODUCT_ID } from '../lib/subscription';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  reason?: string;
}

export default function PaywallModal({ visible, onClose, reason }: Props) {
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');

  const handlePurchase = async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const productId = selectedPlan === 'annual' ? RC_ANNUAL_PRODUCT_ID : RC_MONTHLY_PRODUCT_ID;
      const products = await Purchases.getProducts([productId]);
      if (!products.length) return;
      const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
      const isPro = typeof customerInfo.entitlements.active['pro'] !== 'undefined';
      if (isPro) {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await updateDoc(doc(db, 'users', uid), { subscriptionTier: 'pro' });
        }
        onClose();
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        // purchase error — user can retry
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const info = await Purchases.restorePurchases();
      const isPro = typeof info.entitlements.active['pro'] !== 'undefined';
      if (isPro) {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await updateDoc(doc(db, 'users', uid), { subscriptionTier: 'pro' });
        }
        onClose();
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#0D0D0F', '#1A0A1E']} style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        <Text style={styles.crown}>✦</Text>
        <Text style={styles.title}>Quorum Pro</Text>
        {reason ? <Text style={styles.reason}>{reason}</Text> : null}

        <View style={styles.features}>
          {[
            'Unlimited active plans',
            'Unlimited moments + HD quality',
            'Full chat history',
            'Unlimited templates',
            'Custom plan covers & themes',
            'Plan analytics',
          ].map((f) => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.featureCheck}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={styles.planRow}>
          <TouchableOpacity
            style={[styles.planOption, selectedPlan === 'annual' && styles.planOptionSelected]}
            onPress={() => setSelectedPlan('annual')}
          >
            <Text style={styles.planLabel}>Annual</Text>
            <Text style={styles.planPrice}>$44.99 / yr</Text>
            <Text style={styles.planSavings}>Save 37%</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.planOption, selectedPlan === 'monthly' && styles.planOptionSelected]}
            onPress={() => setSelectedPlan('monthly')}
          >
            <Text style={styles.planLabel}>Monthly</Text>
            <Text style={styles.planPrice}>$5.99 / mo</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.ctaBtn} onPress={handlePurchase} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>Get Quorum Pro</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={loading}>
          <Text style={styles.restoreText}>Restore purchases</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>
          Subscription auto-renews. Cancel anytime in App Store / Google Play settings.
        </Text>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 60,
  },
  closeBtn: { position: 'absolute', top: 16, right: 16, padding: 8 },
  closeBtnText: { color: Colors.textMuted, fontSize: 18 },
  crown: { fontSize: 40, color: Colors.primary, marginBottom: 8 },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: 8,
  },
  reason: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  features: { alignSelf: 'stretch', gap: 10, marginBottom: 32 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureCheck: { color: Colors.primary, fontSize: 16, width: 20 },
  featureText: { color: Colors.text, fontSize: FontSize.md },
  planRow: { flexDirection: 'row', gap: 12, marginBottom: 24, alignSelf: 'stretch' },
  planOption: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.md,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  planOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDim,
  },
  planLabel: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: 4 },
  planPrice: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  planSavings: { color: Colors.primary, fontSize: FontSize.xs, marginTop: 2 },
  ctaBtn: {
    alignSelf: 'stretch',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  ctaText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  restoreBtn: { padding: 8, marginBottom: 16 },
  restoreText: { color: Colors.textMuted, fontSize: FontSize.sm },
  legal: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
});
