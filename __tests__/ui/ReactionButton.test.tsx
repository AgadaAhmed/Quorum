import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ReactionButton from '../../components/plan-detail/ReactionButton';

describe('ReactionButton', () => {
  it('renders the emoji and hides a zero count', () => {
    render(<ReactionButton emoji="Fire" count={0} reacted={false} onPress={jest.fn()} />);
    expect(screen.getByText('Fire')).toBeOnTheScreen();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows the count when greater than zero', () => {
    render(<ReactionButton emoji="Love" count={3} reacted={false} onPress={jest.fn()} />);
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('calls onPress with its emoji', () => {
    const onPress = jest.fn();
    render(<ReactionButton emoji="Wow" count={1} reacted={false} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledWith('Wow');
  });

  it('exposes the reacted state for accessibility', () => {
    render(<ReactionButton emoji="Haha" count={2} reacted onPress={jest.fn()} />);
    expect(screen.getByRole('button', { selected: true })).toBeOnTheScreen();
  });
});
