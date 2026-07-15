import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import SwipeablePlanCard from '../../components/home/SwipeablePlanCard';
import { Plan } from '../../components/home/shared';

const plan: Plan = {
  id: 'p1',
  title: 'Karaoke Night',
  description: '',
  date: 'Friday, July 18',
  location: 'Downtown',
  votes: ['u1', 'u2'],
  requiredVotes: 4,
  createdBy: 'creator1',
  status: 'pending',
  category: 'Music',
};

function renderCard(overrides: Partial<React.ComponentProps<typeof SwipeablePlanCard>> = {}) {
  const handlers = {
    onPress: jest.fn(),
    onLongPress: jest.fn(),
    onArchive: jest.fn(),
    onUnarchive: jest.fn(),
    onDelete: jest.fn(),
    onLeave: jest.fn(),
    onPin: jest.fn(),
    onUnpin: jest.fn(),
  };
  render(
    <SwipeablePlanCard
      item={plan}
      index={0}
      uid="u1"
      isArchived={false}
      isPinned={false}
      {...handlers}
      {...overrides}
    />
  );
  return handlers;
}

describe('SwipeablePlanCard', () => {
  // GlassCard animates on mount; fake timers keep the spring inside act().
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('shows title, meta, and quorum percentage', () => {
    renderCard();
    expect(screen.getByText('Karaoke Night')).toBeOnTheScreen();
    expect(screen.getByText('Friday, July 18')).toBeOnTheScreen();
    expect(screen.getByText('Downtown')).toBeOnTheScreen();
    // 2 of 4 votes; both the card label and QuorumProgressBar show the percentage
    expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('MUSIC • ACTIVE')).toBeOnTheScreen();
  });

  it('labels the card for participants vs the creator', () => {
    renderCard();
    expect(screen.getByText('View Details →')).toBeOnTheScreen();

    renderCard({ uid: 'creator1' });
    expect(screen.getByText('Manage Plan →')).toBeOnTheScreen();
  });

  it('reflects confirmed and archived status', () => {
    renderCard({ item: { ...plan, status: 'confirmed' } });
    expect(screen.getByText('Confirmed')).toBeOnTheScreen();
    expect(screen.getByText('MUSIC • CONFIRMED')).toBeOnTheScreen();

    renderCard({ isArchived: true });
    expect(screen.getByText('Archived')).toBeOnTheScreen();
  });

  it('opens the plan on press and the context menu on long press', () => {
    const h = renderCard();
    fireEvent.press(screen.getByText('Karaoke Night'));
    expect(h.onPress).toHaveBeenCalledWith('p1');

    fireEvent(screen.getByText('Karaoke Night'), 'longPress');
    expect(h.onLongPress).toHaveBeenCalledWith(plan);
  });
});
