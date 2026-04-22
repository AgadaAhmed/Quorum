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
