import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { FirstRunEmptyState, FilteredEmptyState } from '../../components/home/EmptyStates';

describe('FirstRunEmptyState', () => {
  it('walks through the three onboarding steps', () => {
    render(<FirstRunEmptyState onCreate={jest.fn()} />);
    expect(screen.getByText('Welcome to Quorum')).toBeOnTheScreen();
    expect(screen.getByText('Create a plan')).toBeOnTheScreen();
    expect(screen.getByText('Invite friends')).toBeOnTheScreen();
    expect(screen.getByText('Reach quorum')).toBeOnTheScreen();
  });

  it('fires onCreate from the call-to-action', () => {
    const onCreate = jest.fn();
    render(<FirstRunEmptyState onCreate={onCreate} />);
    fireEvent.press(screen.getByLabelText('Create your first plan'));
    expect(onCreate).toHaveBeenCalled();
  });
});

describe('FilteredEmptyState', () => {
  it('describes an empty search result', () => {
    render(<FilteredEmptyState search="karaoke" filter="all" />);
    expect(screen.getByText('No results for "karaoke"')).toBeOnTheScreen();
    expect(screen.getByText('Try a different search term')).toBeOnTheScreen();
  });

  it.each([
    ['confirmed', 'No confirmed plans'],
    ['archived', 'Nothing archived'],
    ['pending', 'No pending plans'],
  ] as const)('describes an empty %s filter', (filter, title) => {
    render(<FilteredEmptyState search="" filter={filter} />);
    expect(screen.getByText(title)).toBeOnTheScreen();
    expect(screen.getByText('Try a different filter')).toBeOnTheScreen();
  });
});
