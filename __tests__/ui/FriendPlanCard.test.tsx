import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import FriendPlanCard from '../../components/home/FriendPlanCard';

const item = {
  id: 'plan1',
  title: 'Beach Day',
  friendName: 'Alex',
  status: 'pending',
};

describe('FriendPlanCard', () => {
  it('shows the plan title and which friend is going', () => {
    render(<FriendPlanCard item={item} onPress={jest.fn()} />);
    expect(screen.getByText('Beach Day')).toBeOnTheScreen();
    expect(screen.getByText('Alex is going')).toBeOnTheScreen();
  });

  it('labels a pending plan as Voting and a confirmed one as Confirmed', () => {
    const { rerender } = render(<FriendPlanCard item={item} onPress={jest.fn()} />);
    expect(screen.getByText('Voting')).toBeOnTheScreen();

    rerender(<FriendPlanCard item={{ ...item, status: 'confirmed' }} onPress={jest.fn()} />);
    expect(screen.getByText('Confirmed')).toBeOnTheScreen();
  });

  it('reports the plan id when pressed', () => {
    const onPress = jest.fn();
    render(<FriendPlanCard item={item} onPress={onPress} />);
    fireEvent.press(screen.getByText('Beach Day'));
    expect(onPress).toHaveBeenCalledWith('plan1');
  });
});
