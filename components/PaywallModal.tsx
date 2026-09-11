import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Purchases, { type PurchasesStoreProduct } from 'react-native-purchases';
import { RC_MONTHLY_PRODUCT_ID, RC_ANNUAL_PRODUCT_ID } from '../lib/subscription';
import { Ionicons } from '@expo/vector-icons';
import { FontSize, FontWeight, Radius, Spacing, type ThemePalette } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  reason?: string;
}

type Plan = 'monthly' | 'annual';

// Only perks that are actually built and enforced.
const FEATURES = [
  'Unlimited active plans',
  'Unlimited moments',
  'Full chat history',
  'Unlimited templates',
  'Themes',
] as const;

const FeatureRow = React.memo(function FeatureRow({ label }: { label: string }) {
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.featureRow}>
      <Ionicons name="checkmark" size={16} color={Colors.secondary} />
      <Text style={styles.featureText}>{label}</Text>
    </View>
  );
});

export default function PaywallModal({ visible, onClose, reason }: Props) {
  const Colors = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Monochrome backdrop gradient.
  const backdropGradient = useMemo(() => [Colors.surface, Colors.surfaceRaised] as const, [Colors]);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');
  const [monthlyProduct, setMonthlyProduct] = useState<PurchasesStoreProduct | null>(null);
  const [annualProduct, setAnnualProduct] = useState<PurchasesStoreProduct | null>(null);

  // Fetch localized, region-specific prices from RevenueCat when the sheet opens.
  // `priceString` is already formatted for the user's store region + currency
  // (e.g. "R15,00" in ZA), so pricing is regional automatically — no hardcoding.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    Purchases.getProducts([RC_MONTHLY_PRODUCT_ID, RC_ANNUAL_PRODUCT_ID])
      .then((products) => {
        if (!alive) return;
        setMonthlyProduct(products.find((p) => p.identifier === RC_MONTHLY_PRODUCT_ID) ?? null);
        setAnnualProduct(products.find((p) => p.identifier === RC_ANNUAL_PRODUCT_ID) ?? null);
      })
      .catch(() => {
        // RevenueCat not configured (e.g. Expo Go) or offline — prices show as a dash.
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  const annualPrice = annualProduct?.priceString ?? '—';
  const monthlyPrice = monthlyProduct?.priceString ?? '—';
  // "One month free" annual → savings computed from the real prices, not hardcoded.
  const savingsPct = useMemo(() => {
    if (!monthlyProduct || !annualProduct || monthlyProduct.price <= 0) return null;
    const pct = Math.round((1 - annualProduct.price / (monthlyProduct.price * 12)) * 100);
    return pct > 0 ? pct : null;
  }, [monthlyProduct, annualProduct]);

  // NOTE: the tier is NOT written from the client. After a successful purchase,
  // RevenueCat fires the webhook Cloud Function, which writes `subscriptionTier`
  // via the Admin SDK; `useSubscription()` then flips `isPro` in real time. We
  // just close the modal once RevenueCat confirms the entitlement is active.
  const handlePurchase = useCallback(async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const productId = selectedPlan === 'annual' ? RC_ANNUAL_PRODUCT_ID : RC_MONTHLY_PRODUCT_ID;
      const products = await Purchases.getProducts([productId]);
      if (!products.length) return;
      const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
      const isPro = typeof customerInfo.entitlements.active['pro'] !== 'undefined';
      if (isPro) {
        onClose();
      }
    } catch (e) {
      // RevenueCat sets userCancelled on cancellation; any other error is silently
      // ignored so the user can retry.
      if (!(e as { userCancelled?: boolean })?.userCancelled) {
        // purchase error — user can retry
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, onClose]);

  const handleRestore = useCallback(async () => {
    setLoading(true);
    try {
      const info = await Purchases.restorePurchases();
      const isPro = typeof info.entitlements.active['pro'] !== 'undefined';
      if (isPro) {
        onClose();
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [onClose]);

  const selectAnnual = useCallback(() => setSelectedPlan('annual'), []);
  const selectMonthly = useCallback(() => setSelectedPlan('monthly'), []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <LinearGradient colors={backdropGradient} style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityLabel="Close"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <Ionicons name="star" size={28} color={Colors.gold} style={styles.heroIcon} />
          <Text style={styles.title}>Quorum Pro</Text>
          {reason ? <Text style={styles.reason}>{reason}</Text> : null}

          <View style={styles.features}>
            {FEATURES.map((f) => (
              <FeatureRow key={f} label={f} />
            ))}
          </View>

          <View style={styles.planRow}>
            <TouchableOpacity
              style={[styles.planOption, selectedPlan === 'annual' && styles.planOptionSelected]}
              onPress={selectAnnual}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedPlan === 'annual' }}
              accessibilityLabel={`Annual plan, ${annualPrice} per year${savingsPct ? `, save ${savingsPct} percent` : ''}`}
            >
              <Text style={styles.planLabel}>Annual</Text>
              <Text style={styles.planPrice}>{annualPrice} / yr</Text>
              <Text style={styles.planSavings}>{savingsPct ? `Save ${savingsPct}%` : 'Best value'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.planOption, selectedPlan === 'monthly' && styles.planOptionSelected]}
              onPress={selectMonthly}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedPlan === 'monthly' }}
              accessibilityLabel={`Monthly plan, ${monthlyPrice} per month`}
            >
              <Text style={styles.planLabel}>Monthly</Text>
              <Text style={styles.planPrice}>{monthlyPrice} / mo</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.ctaBtn, loading && styles.btnDisabled]}
            onPress={handlePurchase}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Get Quorum Pro"
          >
            {loading ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.ctaText}>Get Quorum Pro</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.restoreBtn}
            onPress={handleRestore}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
          >
            <Text style={styles.restoreText}>Restore purchases</Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            Subscription auto-renews. Cancel anytime in App Store / Google Play settings.
          </Text>
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 60,
    paddingBottom: Spacing.xl,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  reason: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  features: {
    alignSelf: 'stretch',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    color: Colors.text,
    fontSize: FontSize.md,
  },
  planRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    alignSelf: 'stretch',
  },
  planOption: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  planOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDim,
  },
  planLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginBottom: Spacing.xs,
  },
  planPrice: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  planSavings: {
    color: Colors.text,
    fontSize: FontSize.xs,
    marginTop: 2,
    fontWeight: FontWeight.semibold,
  },
  ctaBtn: {
    alignSelf: 'stretch',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: Colors.background,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  restoreBtn: {
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  restoreText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  legal: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
});
