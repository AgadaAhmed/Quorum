import React from 'react';
import { render } from '@testing-library/react-native';
import ConfettiParticles, { ConfettiRef } from '../../components/ConfettiParticles';

it('fires in default (grey) mode without throwing', () => {
  const ref = React.createRef<ConfettiRef>();
  render(<ConfettiParticles ref={ref} />);
  expect(() => ref.current?.fire()).not.toThrow();
});

it('fires in accent mode without throwing', () => {
  const ref = React.createRef<ConfettiRef>();
  render(<ConfettiParticles ref={ref} />);
  expect(() => ref.current?.fire({ accent: true })).not.toThrow();
});
