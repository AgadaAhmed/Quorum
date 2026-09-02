import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ProfilePreviewCard from '../../components/ProfilePreviewCard';
import { PROFILE_COLORS } from '../../lib/profileCustomization';

const base = { displayName: 'Amina', bio: 'hello world' };

describe('ProfilePreviewCard', () => {
  it('renders the display name and bio', () => {
    render(<ProfilePreviewCard draft={base} />);
    expect(screen.getByText('Amina')).toBeOnTheScreen();
    expect(screen.getByText('hello world')).toBeOnTheScreen();
  });

  it('shows the tagline when set', () => {
    render(<ProfilePreviewCard draft={{ ...base, tagline: 'here for the food' }} />);
    expect(screen.getByText('here for the food')).toBeOnTheScreen();
  });

  it('applies the chosen name color to the display name', () => {
    const key = PROFILE_COLORS[0].key;
    render(<ProfilePreviewCard draft={{ ...base, nameColor: key }} />);
    const nameNode = screen.getByText('Amina');
    const flat = Array.isArray(nameNode.props.style)
      ? Object.assign({}, ...nameNode.props.style.filter(Boolean))
      : nameNode.props.style;
    expect(flat.color).toBe(PROFILE_COLORS[0].value);
  });
});
