const SCAM_KEYWORDS = [
  'send money', 'transfer money', 'pay upfront', 'upfront payment', 'fee required',
  'deposit required', 'cash only', 'venmo', 'cashapp', 'cash app', 'zelle',
  'wire transfer', 'bitcoin', 'crypto payment', 'advance fee', 'pay first',
  'payment required', 'bring cash',
];

export function hasScamKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return SCAM_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Content moderation ───────────────────────────────────────────────────────
// A first-pass keyword filter for hate speech and explicit sexual solicitation
// in user-generated plan text (titles/descriptions/location). It is deliberately
// conservative: this is a blunt instrument, so we bias toward avoiding false
// positives (the "Scunthorpe problem") and treat it as a floor, not a substitute
// for human reporting (ReportModal) — which stays the primary safety mechanism.

// Multi-word phrases are matched as substrings (low false-positive risk).
const PROHIBITED_PHRASES = [
  'child porn', 'child sex', 'sell nudes', 'selling nudes', 'send nudes',
  'sex for money', 'sexual favors', 'sexual favours', 'rape you',
  'kill yourself', 'kill all', 'gas the',
];

// Single words that are matched with word boundaries so we don't flag innocent
// substrings (e.g. "class", "assassin", "Scunthorpe"). Kept to unambiguous slurs
// and explicit terms.
const PROHIBITED_WORDS = [
  'nigger', 'niggers', 'faggot', 'faggots', 'kike', 'kikes', 'spic', 'chink',
  'tranny', 'trannies', 'retard', 'retards', 'rapist', 'paedophile', 'pedophile',
  'bestiality', 'incest',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Precompiled: any prohibited word as a whole word (case-insensitive).
const PROHIBITED_WORD_RE = new RegExp(
  `\\b(?:${PROHIBITED_WORDS.map(escapeRegExp).join('|')})\\b`,
  'i',
);

/**
 * True when the text contains hate speech or explicit sexual solicitation that
 * should block a public/user-generated submission. Pure + exported for tests.
 */
export function hasProhibitedContent(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (PROHIBITED_PHRASES.some((p) => lower.includes(p))) return true;
  return PROHIBITED_WORD_RE.test(lower);
}

export type ModerationResult = { ok: true } | { ok: false; reason: string };

/**
 * Moderate one or more free-text fields together (e.g. a plan's title +
 * description + location). Returns a blocking reason on the first failure.
 */
export function moderatePlanText(...parts: (string | null | undefined)[]): ModerationResult {
  const text = parts.filter(Boolean).join(' \n ');
  if (hasProhibitedContent(text)) {
    return {
      ok: false,
      reason: 'Please remove hateful or explicit content before posting this plan.',
    };
  }
  return { ok: true };
}
