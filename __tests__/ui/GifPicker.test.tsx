import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import GifPicker from '../../components/GifPicker';
import * as tenor from '../../lib/tenor';

jest.mock('../../lib/tenor');

const fixtures = [
  { id: '1', gifUrl: 'https://t/1.gif', stillUrl: 'https://t/1.png', dims: [200, 200] as [number, number] },
  { id: '2', gifUrl: 'https://t/2.gif', stillUrl: 'https://t/2.png', dims: [200, 200] as [number, number] },
];

describe('GifPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (tenor.trendingGifs as jest.Mock).mockResolvedValue(fixtures);
    (tenor.searchGifs as jest.Mock).mockResolvedValue([fixtures[1]]);
  });

  it('loads trending on open and renders results', async () => {
    render(<GifPicker visible onSelect={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('gif-result-1')).toBeOnTheScreen());
    expect(screen.getByTestId('gif-result-2')).toBeOnTheScreen();
    expect(tenor.trendingGifs).toHaveBeenCalled();
  });

  it('does not fetch when not visible', () => {
    render(<GifPicker visible={false} onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(tenor.trendingGifs).not.toHaveBeenCalled();
  });

  it('calls onSelect with the chosen result then closes', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    render(<GifPicker visible onSelect={onSelect} onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('gif-result-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('gif-result-1'));
    expect(onSelect).toHaveBeenCalledWith(fixtures[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('searches on submit', async () => {
    render(<GifPicker visible onSelect={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('gif-result-1')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('gif-search-input'), 'party');
    fireEvent(screen.getByTestId('gif-search-input'), 'submitEditing');
    await waitFor(() => expect(tenor.searchGifs).toHaveBeenCalledWith('party', expect.any(Number)));
  });
});
