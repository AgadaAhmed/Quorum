import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// lib/places.ts imports the firebase functions callable layer, which isn't
// transformable under Jest. Stub it the same way __tests__/places.test.ts does.
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => jest.fn()),
}));
jest.mock('../../lib/firebase', () => ({ app: {}, functions: {} }));

import TitlePopup from '../../components/places/TitlePopup';

describe('TitlePopup', () => {
  it('preselects the time-appropriate title and confirms the chosen one', () => {
    const onConfirm = jest.fn();
    const when = new Date(2026, 0, 1, 21, 0); // Night
    const { getByText } = render(
      <TitlePopup
        visible
        venueName="Villa Bar"
        when={when}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    );

    getByText('Night at Villa Bar');
    getByText('Morning at Villa Bar');

    fireEvent.press(getByText('Start planning'));
    expect(onConfirm).toHaveBeenCalledWith('Night at Villa Bar');
  });

  it('switches the selected title when a different chip is tapped', () => {
    const onConfirm = jest.fn();
    const when = new Date(2026, 0, 1, 9, 0); // Morning
    const { getByText } = render(
      <TitlePopup
        visible
        venueName="Villa Bar"
        when={when}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    );

    fireEvent.press(getByText('Evening at Villa Bar'));
    fireEvent.press(getByText('Start planning'));
    expect(onConfirm).toHaveBeenCalledWith('Evening at Villa Bar');
  });

  it('calls onClose when the close icon is pressed', () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <TitlePopup
        visible
        venueName="Villa Bar"
        when={new Date(2026, 0, 1, 9, 0)}
        onConfirm={() => {}}
        onClose={onClose}
      />
    );

    fireEvent.press(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
