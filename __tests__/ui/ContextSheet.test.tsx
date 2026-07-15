import React from 'react';
import { Animated } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ContextSheet from '../../components/home/ContextSheet';
import { Plan } from '../../components/home/shared';

const plan: Plan = {
  id: 'p1',
  title: 'Game Night',
  description: '',
  date: '',
  location: '',
  votes: [],
  requiredVotes: 3,
  createdBy: 'creator1',
  status: 'pending',
};

function renderSheet(overrides: Partial<React.ComponentProps<typeof ContextSheet>> = {}) {
  const handlers = {
    onClose: jest.fn(),
    onView: jest.fn(),
    onChat: jest.fn(),
    onPin: jest.fn(),
    onUnpin: jest.fn(),
    onArchive: jest.fn(),
    onUnarchive: jest.fn(),
    onDelete: jest.fn(),
    onLeave: jest.fn(),
  };
  render(
    <ContextSheet
      plan={plan}
      uid="creator1"
      translateY={new Animated.Value(0)}
      isPinned={false}
      isArchived={false}
      {...handlers}
      {...overrides}
    />
  );
  return handlers;
}

describe('ContextSheet', () => {
  it('shows the plan title and core actions', () => {
    renderSheet();
    expect(screen.getByText('Game Night')).toBeOnTheScreen();
    expect(screen.getByText('View Plan')).toBeOnTheScreen();
    expect(screen.getByText('Open Chat')).toBeOnTheScreen();
    expect(screen.getByText('Pin to Top')).toBeOnTheScreen();
    expect(screen.getByText('Archive')).toBeOnTheScreen();
  });

  it('closes and opens the plan on View Plan', () => {
    const h = renderSheet();
    fireEvent.press(screen.getByText('View Plan'));
    expect(h.onClose).toHaveBeenCalled();
    expect(h.onView).toHaveBeenCalledWith('p1');
  });

  it('passes the plan id and title to chat', () => {
    const h = renderSheet();
    fireEvent.press(screen.getByText('Open Chat'));
    expect(h.onChat).toHaveBeenCalledWith('p1', 'Game Night');
  });

  it('flips pin/unpin and archive/restore labels with state', () => {
    renderSheet({ isPinned: true, isArchived: true });
    expect(screen.getByText('Unpin')).toBeOnTheScreen();
    expect(screen.getByText('Restore')).toBeOnTheScreen();
  });

  it('offers Delete to the creator and Leave to everyone else', () => {
    const h = renderSheet();
    fireEvent.press(screen.getByText('Delete Plan'));
    expect(h.onDelete).toHaveBeenCalledWith(plan);

    const h2 = renderSheet({ uid: 'someoneElse' });
    fireEvent.press(screen.getByText('Leave Plan'));
    expect(h2.onLeave).toHaveBeenCalledWith(plan);
  });

  it('renders nothing when no plan is selected', () => {
    renderSheet({ plan: null });
    expect(screen.queryByText('View Plan')).toBeNull();
  });
});
