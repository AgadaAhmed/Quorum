import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassCard from '../GlassCard';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '../../lib/theme';
import { ONBOARDING_STEPS, StatusFilter } from './shared';

export const FirstRunEmptyState = React.memo(function FirstRunEmptyState({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <View style={styles.onboarding}>
      <Ionicons
        name="calendar-outline"
        size={52}
        color={Colors.textMuted}
        style={styles.dimIcon}
      />
      <Text style={styles.onboardingTitle}>Welcome to Quorum</Text>
      <Text style={styles.onboardingSubtitle}>Plan together, decide together.</Text>
      <GlassCard style={styles.stepsCard} noAnimate>
        {ONBOARDING_STEPS.map((s) => (
          <View key={s.step} style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{s.step}</Text>
            </View>
            <View style={styles.flex1}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepDesc}>{s.desc}</Text>
            </View>
          </View>
        ))}
      </GlassCard>
      <TouchableOpacity
        style={styles.emptyBtn}
        onPress={onCreate}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Create your first plan"
      >
        <Text style={styles.emptyBtnText}>Create your first plan</Text>
        <Ionicons name="arrow-forward" size={16} color={Colors.background} style={styles.btnIcon} />
      </TouchableOpacity>
    </View>
  );
});

export const FilteredEmptyState = React.memo(function FilteredEmptyState({
  search,
  filter,
}: {
  search: string;
  filter: StatusFilter;
}) {
  const title = search
    ? `No results for "${search}"`
    : filter === 'confirmed'
    ? 'No confirmed plans'
    : filter === 'archived'
    ? 'Nothing archived'
    : 'No pending plans';
  return (
    <View style={styles.emptyFiltered}>
      <Ionicons
        name="calendar-outline"
        size={44}
        color={Colors.textMuted}
        style={styles.dimIcon}
      />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>
        {search ? 'Try a different search term' : 'Try a different filter'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  dimIcon: { opacity: 0.5, marginBottom: Spacing.xs },
  btnIcon: { marginLeft: 6 },
  onboarding: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 56,
    gap: 12,
  },
  onboardingTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  onboardingSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
    lineHeight: 22,
  },
  stepsCard: {
    width: '100%',
    padding: Spacing.md,
    gap: 16,
    marginBottom: 4,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: { color: Colors.background, fontWeight: FontWeight.black, fontSize: 13 },
  stepTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    lineHeight: 22,
  },
  stepDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadow.primary,
  },
  emptyBtnText: {
    color: Colors.background,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.md,
  },
  emptyFiltered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },
});
