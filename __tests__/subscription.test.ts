import {
  ALL_FEATURES_FREE,
  computeIsPro,
  isAtPlanLimit,
  isAtMomentsLimit,
  isAtTemplatesLimit,
  getChatHistoryCutoff,
  FREE_LIMITS,
} from '../lib/subscription';

describe('isAtPlanLimit', () => {
  it('returns false for pro users regardless of count', () => {
    expect(isAtPlanLimit(100, 'pro')).toBe(false);
  });
  it('returns false when under limit', () => {
    expect(isAtPlanLimit(2, 'free')).toBe(false);
  });
  it('returns false at exactly the limit (ALL_FEATURES_FREE is true)', () => {
    // Since ALL_FEATURES_FREE = true, limits are disabled for everyone
    expect(isAtPlanLimit(FREE_LIMITS.activePlans, 'free')).toBe(false);
  });
  it('returns false when over limit (ALL_FEATURES_FREE is true)', () => {
    // Since ALL_FEATURES_FREE = true, limits are disabled for everyone
    expect(isAtPlanLimit(FREE_LIMITS.activePlans + 1, 'free')).toBe(false);
  });
});

describe('isAtMomentsLimit', () => {
  it('returns false for pro users regardless of count', () => {
    expect(isAtMomentsLimit(100, 'pro')).toBe(false);
  });
  it('returns false when under limit', () => {
    expect(isAtMomentsLimit(5, 'free')).toBe(false);
  });
  it('returns false at exactly the limit (ALL_FEATURES_FREE is true)', () => {
    // Since ALL_FEATURES_FREE = true, limits are disabled for everyone
    expect(isAtMomentsLimit(FREE_LIMITS.momentsPerPlan, 'free')).toBe(false);
  });
});

describe('isAtTemplatesLimit', () => {
  it('returns false for pro users regardless of count', () => {
    expect(isAtTemplatesLimit(100, 'pro')).toBe(false);
  });
  it('returns false at exactly the limit (ALL_FEATURES_FREE is true)', () => {
    // Since ALL_FEATURES_FREE = true, limits are disabled for everyone
    expect(isAtTemplatesLimit(FREE_LIMITS.templates, 'free')).toBe(false);
  });
});

describe('getChatHistoryCutoff', () => {
  it('returns null for pro users (no cutoff)', () => {
    expect(getChatHistoryCutoff('pro')).toBeNull();
  });
  it('returns null for free users (ALL_FEATURES_FREE is true)', () => {
    // Since ALL_FEATURES_FREE = true, no cutoff for anyone
    const cutoff = getChatHistoryCutoff('free');
    expect(cutoff).toBeNull();
  });
});

describe('everything free', () => {
  it('flag is on', () => {
    expect(ALL_FEATURES_FREE).toBe(true);
  });

  it('computeIsPro is true even for a free tier', () => {
    expect(computeIsPro('free')).toBe(true);
    expect(computeIsPro('pro')).toBe(true);
  });

  it('no plan/moments/templates limit for free users', () => {
    expect(isAtPlanLimit(999, 'free')).toBe(false);
    expect(isAtMomentsLimit(999, 'free')).toBe(false);
    expect(isAtTemplatesLimit(999, 'free')).toBe(false);
  });

  it('free users get full chat history (no cutoff)', () => {
    expect(getChatHistoryCutoff('free')).toBeNull();
  });
});
