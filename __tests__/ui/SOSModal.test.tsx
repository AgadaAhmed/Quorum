import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockShowToast = jest.fn();
jest.mock('../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

import SOSModal from '../../components/plan-detail/SOSModal';

const plan = { id: 'p1', title: 'Night Hike', location: 'Trailhead', date: 'Friday, July 18' };

describe('SOSModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the current plan details', () => {
    render(<SOSModal visible onClose={jest.fn()} plan={plan} emergencyContact={null} />);
    expect(screen.getByText('Emergency SOS')).toBeOnTheScreen();
    expect(screen.getByText('Night Hike')).toBeOnTheScreen();
    expect(screen.getByText('Trailhead')).toBeOnTheScreen();
  });

  it('prompts to add an emergency contact when none is set', () => {
    render(<SOSModal visible onClose={jest.fn()} plan={plan} emergencyContact={null} />);
    expect(
      screen.getByText('No emergency contact set. Add one in your Profile.')
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Call /)).toBeNull();
  });

  it('shows the emergency contact and a call button when set', () => {
    render(
      <SOSModal
        visible
        onClose={jest.fn()}
        plan={plan}
        emergencyContact={{ name: 'Mo', phone: '+15551234' }}
      />
    );
    expect(screen.getByText('Mo')).toBeOnTheScreen();
    expect(screen.getByText('+15551234')).toBeOnTheScreen();
    expect(screen.getByLabelText('Call Mo')).toBeOnTheScreen();
  });

  it('disables sharing location when the plan has none', () => {
    render(
      <SOSModal
        visible
        onClose={jest.fn()}
        plan={{ ...plan, location: '' }}
        emergencyContact={null}
      />
    );
    expect(screen.getByLabelText('Share location')).toBeDisabled();
  });

  it('calls onClose from the Close button', () => {
    const onClose = jest.fn();
    render(<SOSModal visible onClose={onClose} plan={plan} emergencyContact={null} />);
    fireEvent.press(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
