import { hasScamKeywords, hasProhibitedContent, moderatePlanText } from '../lib/scamDetection';

describe('hasScamKeywords', () => {
  it('flags known scam phrases', () => {
    expect(hasScamKeywords('Please send money first')).toBe(true);
    expect(hasScamKeywords('Pay via cashapp')).toBe(true);
  });
  it('passes normal text', () => {
    expect(hasScamKeywords('Dinner at 7pm downtown')).toBe(false);
  });
});

describe('hasProhibitedContent', () => {
  it('flags hate slurs as whole words', () => {
    expect(hasProhibitedContent('you retard')).toBe(true);
  });
  it('flags explicit phrases', () => {
    expect(hasProhibitedContent('send nudes for entry')).toBe(true);
  });
  it('does NOT flag innocent substrings (Scunthorpe problem)', () => {
    expect(hasProhibitedContent('Chess club at Scunthorpe')).toBe(false);
    expect(hasProhibitedContent('Assassin board game night')).toBe(false);
    expect(hasProhibitedContent('Class reunion')).toBe(false);
  });
  it('passes normal plan text', () => {
    expect(hasProhibitedContent('Beach volleyball on Saturday')).toBe(false);
  });
  it('handles empty input', () => {
    expect(hasProhibitedContent('')).toBe(false);
  });
});

describe('moderatePlanText', () => {
  it('returns ok for clean text across fields', () => {
    expect(moderatePlanText('Picnic', 'Bring snacks', 'Central Park')).toEqual({ ok: true });
  });
  it('blocks when any field has prohibited content, with a reason', () => {
    const res = moderatePlanText('Nice title', 'you faggot', 'somewhere');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/hateful or explicit/i);
  });
  it('ignores null/undefined fields', () => {
    expect(moderatePlanText('Hike', null, undefined)).toEqual({ ok: true });
  });
});
