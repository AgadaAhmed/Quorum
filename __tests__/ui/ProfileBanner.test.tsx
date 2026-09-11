import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ProfileBanner from '../../components/ProfileBanner';

describe('ProfileBanner', () => {
  it('renders nothing when no banner is set', () => {
    render(<ProfileBanner testID="banner" />);
    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('renders the still when not animated', () => {
    render(<ProfileBanner testID="banner" gifUrl="https://b/1.gif" stillUrl="https://b/1.png" />);
    const img = screen.getByTestId('banner');
    const src = img.props.source;
    expect((Array.isArray(src) ? src[0] : src)).toEqual({ uri: 'https://b/1.png' });
    expect(img.props.autoplay).toBe(false);
  });

  it('plays the gif when animated', () => {
    render(<ProfileBanner testID="banner" gifUrl="https://b/1.gif" stillUrl="https://b/1.png" animated />);
    const img = screen.getByTestId('banner');
    const src = img.props.source;
    expect((Array.isArray(src) ? src[0] : src)).toEqual({ uri: 'https://b/1.gif' });
    expect(img.props.autoplay).toBe(true);
  });
});
