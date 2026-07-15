import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import AnimatedCard from '../AnimatedCard';
import { useToast } from '../Toast';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';

export default function PollTab({ plan, uid }: { plan: any; uid: string }) {
  const { showToast } = useToast();

  const handlePollVote = async (option: string) => {
    if (!plan?.poll) return;
    Haptics.selectionAsync();
    const updates: any = {};
    plan.poll.options.forEach((opt: string) => {
      const currentVotes: string[] = plan.poll.votes?.[opt] || [];
      if (opt === option) {
        updates[`poll.votes.${opt}`] = currentVotes.includes(uid) ? arrayRemove(uid) : arrayUnion(uid);
      } else if (currentVotes.includes(uid)) {
        updates[`poll.votes.${opt}`] = arrayRemove(uid);
      }
    });
    if (Object.keys(updates).length > 0) {
      try {
        await updateDoc(doc(db, 'plans', plan.id), updates);
      } catch {
        showToast('Failed to record poll vote', 'error');
      }
    }
  };

  if (!plan.poll) {
    return (
      <View style={styles.tabEmptyState}>
        <Ionicons name="bar-chart-outline" size={40} color={Colors.textMuted} style={{ marginBottom: 12 }} />
        <Text style={styles.tabEmptyTitle}>No poll for this plan</Text>
        <Text style={styles.tabEmptyText}>The host hasn&apos;t added a poll yet.</Text>
      </View>
    );
  }
  const pollTotalVotes = plan.poll.options.reduce(
    (sum: number, o: string) => sum + (plan.poll.votes?.[o]?.length || 0), 0
  );
  return (
    <AnimatedCard index={0} style={{ marginBottom: Spacing.md }}>
      <Text style={styles.pollQuestion}>{plan.poll.question}</Text>
      <Text style={styles.pollMeta}>
        {pollTotalVotes === 0
          ? 'No votes yet — tap an option to vote'
          : `${pollTotalVotes} ${pollTotalVotes === 1 ? 'vote' : 'votes'} · tap to change`}
      </Text>
      {plan.poll.options.map((opt: string) => {
        const votes: string[] = plan.poll.votes?.[opt] || [];
        const hasVotedForThis = votes.includes(uid);
        const percentage = pollTotalVotes > 0 ? Math.round((votes.length / pollTotalVotes) * 100) : 0;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.pollOption, hasVotedForThis && styles.pollOptionActive]}
            onPress={() => handlePollVote(opt)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: hasVotedForThis }}
            accessibilityLabel={`${opt}, ${percentage} percent, ${votes.length} ${votes.length === 1 ? 'vote' : 'votes'}`}
          >
            <View style={[styles.pollOptionFill, { width: `${percentage}%` as any }]} />
            <View style={styles.pollOptionLabelWrap}>
              {hasVotedForThis && (
                <Ionicons name="checkmark-circle" size={16} color={Colors.primary} style={styles.iconMr6} />
              )}
              <Text
                style={[styles.pollOptionText, hasVotedForThis && styles.pollOptionTextActive]}
                numberOfLines={1}
              >
                {opt}
              </Text>
            </View>
            <Text style={[styles.pollOptionPct, hasVotedForThis && styles.pollOptionTextActive]}>{percentage}%</Text>
          </TouchableOpacity>
        );
      })}
    </AnimatedCard>
  );
}

const styles = StyleSheet.create({
  iconMr6: { marginRight: 6 },
  tabEmptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: Spacing.xl },
  tabEmptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 6 },
  tabEmptyText: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center' },
  pollQuestion: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
    lineHeight: 24,
  },
  pollMeta: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.sm,
  },
  pollOption: {
    flexDirection: 'row', alignItems: 'center', borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8, minHeight: 48, position: 'relative',
  },
  pollOptionActive: { borderColor: Colors.borderStrong },
  pollOptionFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: Colors.surfaceBright,
  },
  pollOptionLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingVertical: 8,
  },
  pollOptionText: { color: Colors.textSecondary, fontWeight: FontWeight.semibold, fontSize: FontSize.md },
  pollOptionTextActive: { color: Colors.primary, fontWeight: FontWeight.bold },
  pollOptionPct: {
    paddingHorizontal: 12,
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
});
