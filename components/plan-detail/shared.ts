// Shared constants, types, and helpers for the plan-detail screen and its
// extracted sub-components.

// Lazy import — expo-notifications' index.js runs DevicePushTokenAutoRegistration.fx.js
// as a side-effect at load time, crashing Expo Go. Deferring to a getter means the
// module only loads when a notification is actually scheduled (works fine in Expo Go).
/* eslint-disable @typescript-eslint/no-require-imports */
export const Notifications = {
  scheduleNotificationAsync: (...args: Parameters<typeof import('expo-notifications').scheduleNotificationAsync>) =>
    (require('expo-notifications') as typeof import('expo-notifications')).scheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: Parameters<typeof import('expo-notifications').cancelScheduledNotificationAsync>) =>
    (require('expo-notifications') as typeof import('expo-notifications')).cancelScheduledNotificationAsync(...args),
  SchedulableTriggerInputTypes: new Proxy({} as typeof import('expo-notifications').SchedulableTriggerInputTypes, {
    get: (_t, prop) => (require('expo-notifications') as typeof import('expo-notifications')).SchedulableTriggerInputTypes[prop as keyof typeof import('expo-notifications').SchedulableTriggerInputTypes],
  }),
};
/* eslint-enable @typescript-eslint/no-require-imports */

export const REACTIONS = ['Love', 'Fire', 'Haha', 'Wow', 'No'] as const;
export const CATEGORIES = ['Music', 'Food', 'Sports', 'Art', 'Gaming', 'Travel', 'Party', 'Study'] as const;

export type DetailTab = 'Overview' | 'Poll' | 'Chat' | 'Moments';
export type VisibleTab = { key: DetailTab; label: string };

export type Friend = { id: string; displayName: string; username?: string };

// Time constants (ms)
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

// Avatar overlap stack: first avatar flush-left, rest overlap by 8px.
export const AVATAR_OVERLAP = -8;
export const MAX_VISIBLE_AVATARS = 10;

export type ChecklistItem = { text: string; completedBy: string | null; addedBy: string };
export type CommentEntry = { text: string; authorId: string; authorName: string; timestamp: number };

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

// Format a "time ago" label from a timestamp (ms).
export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < ONE_HOUR_MS) return `${Math.floor(diff / 60000)}m`;
  if (diff < ONE_DAY_MS) return `${Math.floor(diff / ONE_HOUR_MS)}h`;
  return `${Math.floor(diff / ONE_DAY_MS)}d`;
}
