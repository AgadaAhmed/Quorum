import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('../../lib/firebase', () => ({ db: {} }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

type PollUpdates = Record<string, { op: string; v: string }>;
const mockUpdateDoc = jest.fn<Promise<void>, [unknown, PollUpdates]>(() => Promise.resolve());
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, coll, id) => ({ path: `${coll}/${id}` })),
  updateDoc: (ref: unknown, updates: PollUpdates) => mockUpdateDoc(ref, updates),
  arrayUnion: jest.fn((v) => ({ op: 'union', v })),
  arrayRemove: jest.fn((v) => ({ op: 'remove', v })),
}));

const mockShowToast = jest.fn();
jest.mock('../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

import PollTab from '../../components/plan-detail/PollTab';

const planWithPoll = {
  id: 'plan1',
  poll: {
    question: 'Where should we eat?',
    options: ['Pizza', 'Sushi'],
    votes: { Pizza: ['u1', 'u2'], Sushi: ['u3'] },
  },
};

describe('PollTab', () => {
  // AnimatedCard animates on mount; fake timers keep the animation inside act().
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('shows an empty state when the plan has no poll', () => {
    render(<PollTab plan={{ id: 'plan1', poll: null }} uid="u1" />);
    expect(screen.getByText('No poll for this plan')).toBeOnTheScreen();
  });

  it('renders the question, vote count, and per-option percentages', () => {
    render(<PollTab plan={planWithPoll} uid="u1" />);
    expect(screen.getByText('Where should we eat?')).toBeOnTheScreen();
    expect(screen.getByText('3 votes · tap to change')).toBeOnTheScreen();
    expect(screen.getByText('67%')).toBeOnTheScreen(); // Pizza: 2/3
    expect(screen.getByText('33%')).toBeOnTheScreen(); // Sushi: 1/3
  });

  it('marks the option the user voted for as selected', () => {
    render(<PollTab plan={planWithPoll} uid="u1" />);
    const selected = screen.getByRole('radio', { selected: true });
    expect(selected.props.accessibilityLabel).toContain('Pizza');
  });

  it('writes a vote for a new option and removes the old one', async () => {
    render(<PollTab plan={planWithPoll} uid="u1" />);
    fireEvent.press(screen.getByLabelText(/Sushi/));
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    const updates = mockUpdateDoc.mock.calls[0][1];
    expect(updates['poll.votes.Sushi'].op).toBe('union');
    expect(updates['poll.votes.Pizza'].op).toBe('remove');
  });

  it('surfaces a toast when the vote write fails', async () => {
    mockUpdateDoc.mockRejectedValueOnce(new Error('offline'));
    render(<PollTab plan={planWithPoll} uid="u1" />);
    fireEvent.press(screen.getByLabelText(/Sushi/));
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Failed to record poll vote', 'error')
    );
  });
});
