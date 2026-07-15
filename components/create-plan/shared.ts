// Shared constants, types, and helpers for the create-plan screen.

export const CATEGORIES = ['Music', 'Food', 'Sports', 'Art', 'Gaming', 'Travel', 'Party', 'Study'] as const;
export const VOTE_OPTIONS = ['2', '3', '5', '7', '10'] as const;
export const MAX_PARTICIPANT_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'No Limit', value: null },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '15', value: 15 },
  { label: '20', value: 20 },
  { label: '30', value: 30 },
  { label: '50', value: 50 },
];
export const MAX_POLL_OPTIONS = 4;
export const MIN_POLL_OPTIONS = 2;
export const COOLDOWN_DAYS = 7;
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DATE_FMT: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export type Template = {
  id: string;
  name?: string;
  description?: string;
  location?: string;
  category?: string;
  requiredVotes?: number;
  isPublic?: boolean;
  maxParticipants?: number | null;
};

export function formatDate(d: Date | null): string | null {
  return d ? d.toLocaleDateString('en-US', DATE_FMT) : null;
}

export function makeInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}
