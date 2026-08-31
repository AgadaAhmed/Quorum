import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PlanBanner, { hashSeed } from '../../components/PlanBanner';

describe('PlanBanner', () => {
  it('renders a banner labelled by category', () => {
    render(<PlanBanner category="Music" seed="plan1" variant="card" />);
    expect(screen.getByLabelText('Music cover')).toBeOnTheScreen();
  });

  it('falls back to a generic label when category is missing', () => {
    render(<PlanBanner seed="plan2" variant="card" />);
    expect(screen.getByLabelText('Plan cover')).toBeOnTheScreen();
  });

  it('is decorative only — renders no category/title text', () => {
    render(<PlanBanner category="Food" seed="plan3" variant="hero" />);
    expect(screen.queryByText(/Food/)).toBeNull();
  });

  it('renders an unknown category without throwing (default icon)', () => {
    render(<PlanBanner category="Nonsense" seed="plan4" variant="thumb" />);
    expect(screen.getByLabelText('Nonsense cover')).toBeOnTheScreen();
  });

  it('hashSeed is deterministic and non-negative', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).toBeGreaterThanOrEqual(0);
  });

  it('hashSeed distributes across seeds', () => {
    const idxs = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((s) => hashSeed(s) % 6);
    expect(new Set(idxs).size).toBeGreaterThan(1);
  });
});
