export type SubscriptionTier = 'free' | 'pro';

export const FREE_LIMITS = {
  activePlans: 3,
  momentsPerPlan: 10,
  chatHistoryDays: 30,
  templates: 2,
} as const;

// Replace these with your actual RevenueCat API keys from app.revenuecat.com
export const RC_API_KEY_IOS = 'appl_REPLACE_WITH_IOS_KEY';
export const RC_API_KEY_ANDROID = 'goog_REPLACE_WITH_ANDROID_KEY';

// Product IDs — must match what you configure in App Store Connect / Google Play Console
export const RC_MONTHLY_PRODUCT_ID = 'quorum_pro_monthly';
export const RC_ANNUAL_PRODUCT_ID = 'quorum_pro_annual';

export function isAtPlanLimit(activePlanCount: number, tier: SubscriptionTier): boolean {
  if (tier === 'pro') return false;
  return activePlanCount >= FREE_LIMITS.activePlans;
}

export function isAtMomentsLimit(momentsCount: number, tier: SubscriptionTier): boolean {
  if (tier === 'pro') return false;
  return momentsCount >= FREE_LIMITS.momentsPerPlan;
}

export function isAtTemplatesLimit(templateCount: number, tier: SubscriptionTier): boolean {
  if (tier === 'pro') return false;
  return templateCount >= FREE_LIMITS.templates;
}

export function getChatHistoryCutoff(tier: SubscriptionTier): Date | null {
  if (tier === 'pro') return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FREE_LIMITS.chatHistoryDays);
  return cutoff;
}
