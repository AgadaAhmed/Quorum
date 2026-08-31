import { isPublicPlanExpired, PUBLIC_PLAN_TTL_DAYS } from '../../lib/planExpiry';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe('isPublicPlanExpired', () => {
  it('hides a plan whose event date is more than 3 days past', () => {
    const date = new Date(NOW - 4 * DAY).toISOString();
    expect(isPublicPlanExpired({ date }, NOW)).toBe(true);
  });

  it('keeps a plan whose event date is within 3 days', () => {
    const date = new Date(NOW - 2 * DAY).toISOString();
    expect(isPublicPlanExpired({ date }, NOW)).toBe(false);
  });

  it('keeps a future-dated plan', () => {
    const date = new Date(NOW + 5 * DAY).toISOString();
    expect(isPublicPlanExpired({ date }, NOW)).toBe(false);
  });

  it('falls back to createdAt when there is no event date', () => {
    const old = { createdAt: { seconds: (NOW - 4 * DAY) / 1000 } };
    const recent = { createdAt: { seconds: (NOW - 1 * DAY) / 1000 } };
    expect(isPublicPlanExpired(old, NOW)).toBe(true);
    expect(isPublicPlanExpired(recent, NOW)).toBe(false);
  });

  it('does not hide a plan with no date and no createdAt', () => {
    expect(isPublicPlanExpired({}, NOW)).toBe(false);
  });

  it('exposes the TTL as 3 days', () => {
    expect(PUBLIC_PLAN_TTL_DAYS).toBe(3);
  });
});
