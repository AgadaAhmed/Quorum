import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import GlassCard from '../GlassCard';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../lib/theme';
import { FriendPlan } from './shared';

type FriendPlanCardProps = {
  item: FriendPlan;
  onPress: (id: string) => void;
};

const FriendPlanCard = React.memo(function FriendPlanCard({
  item,
  onPress,
}: FriendPlanCardProps) {
  const confirmed = item.status === 'confirmed';
  return (
    <GlassCard noAnimate style={styles.friendCard} onPress={() => onPress(item.id)}>
      <Text style={styles.friendTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.friendMeta} numberOfLines={1}>
        {item.friendName} is going
      </Text>
      <View style={styles.friendStatusBadge}>
        <Text style={styles.friendStatusText}>{confirmed ? 'Confirmed' : 'Voting'}</Text>
      </View>
    </GlassCard>
  );
});

const styles = StyleSheet.create({
  friendCard: {
    width: 160,
    minHeight: 110,
    marginBottom: 0,
    padding: Spacing.sm,
  },
  friendTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    lineHeight: 22,
  },
  friendMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    marginTop: 4,
    lineHeight: 16,
  },
  friendStatusBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 'auto',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surfaceRaised,
  },
  friendStatusText: {
    fontSize: 11,
    fontWeight: FontWeight.heavy,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

export default FriendPlanCard;
