import {
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
  it('returns true at exactly the limit', () => {
    expect(isAtPlanLimit(FREE_LIMITS.activePlans, 'free')).toBe(true);
  });
  it('returns true when over limit', () => {
    expect(isAtPlanLimit(FREE_LIMITS.activePlans + 1, 'free')).toBe(true);
  });
});

describe('isAtMomentsLimit', () => {
  it('returns false for pro users regardless of count', () => {
    expect(isAtMomentsLimit(100, 'pro')).toBe(false);
  });
  it('returns false when under limit', () => {
    expect(isAtMomentsLimit(5, 'free')).toBe(false);
  });
  it('returns true at exactly the limit', () => {
    expect(isAtMomentsLimit(FREE_LIMITS.momentsPerPlan, 'free')).toBe(true);
  });
});

describe('isAtTemplatesLimit', () => {
  it('returns false for pro users regardless of count', () => {
    expect(isAtTemplatesLimit(100, 'pro')).toBe(false);
  });
  it('returns true at exactly the limit', () => {
    expect(isAtTemplatesLimit(FREE_LIMITS.templates, 'free')).toBe(true);
  });
});

describe('getChatHistoryCutoff', () => {
  it('returns null for pro users (no cutoff)', () => {
    expect(getChatHistoryCutoff('pro')).toBeNull();
  });
  it('returns a date approximately 30 days ago for free users', () => {
    const cutoff = getChatHistoryCutoff('free');
    expect(cutoff).not.toBeNull();
    const diffDays = (Date.now() - cutoff!.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(FREE_LIMITS.chatHistoryDays, 0);
  });
});
