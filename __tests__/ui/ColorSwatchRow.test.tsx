import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ColorSwatchRow from '../../components/ColorSwatchRow';
import { PROFILE_COLORS } from '../../lib/profileCustomization';

describe('ColorSwatchRow', () => {
  it('renders a swatch per palette color plus a none option', () => {
    render(<ColorSwatchRow selectedKey={undefined} onSelect={jest.fn()} />);
    expect(screen.getByTestId('swatch-none')).toBeOnTheScreen();
    expect(screen.getByTestId(`swatch-${PROFILE_COLORS[0].key}`)).toBeOnTheScreen();
  });

  it('calls onSelect with the color key when a swatch is pressed', () => {
    const onSelect = jest.fn();
    render(<ColorSwatchRow selectedKey={undefined} onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId(`swatch-${PROFILE_COLORS[1].key}`));
    expect(onSelect).toHaveBeenCalledWith(PROFILE_COLORS[1].key);
  });

  it('calls onSelect with undefined when none is pressed', () => {
    const onSelect = jest.fn();
    render(<ColorSwatchRow selectedKey={PROFILE_COLORS[0].key} onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('swatch-none'));
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });
});
