// Shared types, constants, and helpers for the Home tab and its components.

export const FILTER_PILLS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Archived', value: 'archived' },
];

export const ONBOARDING_STEPS = [
  { step: '1', title: 'Create a plan', desc: 'Pick an activity, set a date and location' },
  { step: '2', title: 'Invite friends', desc: 'Add friends and share the plan with them' },
  { step: '3', title: 'Reach quorum', desc: 'Once enough people vote, the plan is confirmed' },
] as const;

export const SKELETON_KEYS = ['s1', 's2', 's3'];

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export type StatusFilter = 'all' | 'pending' | 'confirmed' | 'archived';

export type Plan = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  votes: string[];
  requiredVotes: number;
  createdBy: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  archivedBy?: string[];
  coverUrl?: string;
  category?: string;
  dateTimestamp?: string;
  pinnedBy?: string[];
  voteDeadline?: string;
  maxParticipants?: number;
  participants?: string[];
};

export type FriendPlan = {
  id: string;
  title: string;
  friendName: string;
  status: string;
  category?: string;
};

export const getCountdown = (dateTimestamp?: string): string | null => {
  if (!dateTimestamp) return null;
  const time = new Date(dateTimestamp).getTime();
  if (Number.isNaN(time)) return null;
  const diff = time - Date.now();
  if (diff < 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `In ${days} days`;
  return null;
};

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const quorumPercent = (plan: Plan): number => {
  const votes = plan.votes?.length || 0;
  const required = Math.max(plan.requiredVotes || 3, 1);
  return Math.round(Math.min(votes / required, 1) * 100);
};
