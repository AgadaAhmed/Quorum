import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Avatar from '../../components/Avatar';

describe('Avatar', () => {
  it('renders initials when there is no image', () => {
    render(<Avatar name="amina" testID="av" />);
    expect(screen.getByText('A')).toBeOnTheScreen();
    expect(screen.queryByTestId('av-image')).toBeNull();
  });

  it('renders an image when an uploaded url is provided', () => {
    render(<Avatar name="amina" uploadUrl="https://x/a.jpg" testID="av" />);
    expect(screen.getByTestId('av-image')).toBeOnTheScreen();
    expect(screen.queryByText('A')).toBeNull();
  });

  it('plays the gif on a profile screen (animated) and uses the still elsewhere', () => {
    const { rerender } = render(
      <Avatar name="amina" gifUrl="https://x/a.gif" stillUrl="https://x/a.jpg" animated testID="av" />
    );
    const gifSource = screen.getByTestId('av-image').props.source;
    expect(Array.isArray(gifSource) ? gifSource[0] : gifSource).toEqual({ uri: 'https://x/a.gif' });
    expect(screen.getByTestId('av-image').props.autoplay).toBe(true);

    rerender(
      <Avatar name="amina" gifUrl="https://x/a.gif" stillUrl="https://x/a.jpg" testID="av" />
    );
    const stillSource = screen.getByTestId('av-image').props.source;
    expect(Array.isArray(stillSource) ? stillSource[0] : stillSource).toEqual({ uri: 'https://x/a.jpg' });
    expect(screen.getByTestId('av-image').props.autoplay).toBe(false);
  });

  it('renders no decoration in this plan (empty registry)', () => {
    render(<Avatar name="amina" decorationId="cat-ears" testID="av" />);
    expect(screen.queryByTestId('avatar-decoration')).toBeNull();
  });
});
