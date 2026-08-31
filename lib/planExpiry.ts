// Public plans shouldn't linger in Discover forever. A public plan is considered
// expired 3 days after its event date — or, if it has no date, 3 days after it was
// created. Expired public plans are hidden from Discover (the plan itself is not
// deleted; the creator keeps it). Reversible by design.

export const PUBLIC_PLAN_TTL_DAYS = 3;

type Firestoreish = { seconds: number } | string | null | undefined;

function toMillis(value: Firestoreish): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return value.seconds * 1000;
  }
  return null;
}

/**
 * True if a public plan should be hidden from Discover. Anchors to the event
 * date, falling back to creation time. If neither is known, returns false (we
 * don't hide plans we can't date).
 */
export function isPublicPlanExpired(
  plan: { date?: Firestoreish; createdAt?: Firestoreish },
  now: number = Date.now(),
  ttlDays: number = PUBLIC_PLAN_TTL_DAYS
): boolean {
  const anchor = toMillis(plan.date) ?? toMillis(plan.createdAt);
  if (anchor == null) return false;
  return now > anchor + ttlDays * 24 * 60 * 60 * 1000;
}
