import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import TemplatesModal from '../../components/create-plan/TemplatesModal';
import { Template } from '../../components/create-plan/shared';

const templates: Template[] = [
  { id: 't1', name: 'Movie Night', description: 'Weekly movies', requiredVotes: 5, isPublic: true, category: 'Party' },
  { id: 't2', name: 'Study Group' },
];

describe('TemplatesModal', () => {
  it('shows an empty state when there are no templates', () => {
    render(
      <TemplatesModal visible templates={[]} onClose={jest.fn()} onApply={jest.fn()} onDelete={jest.fn()} />
    );
    expect(screen.getByText('No templates yet')).toBeOnTheScreen();
  });

  it('lists templates with their tags', () => {
    render(
      <TemplatesModal visible templates={templates} onClose={jest.fn()} onApply={jest.fn()} onDelete={jest.fn()} />
    );
    expect(screen.getByText('Movie Night')).toBeOnTheScreen();
    expect(screen.getByText('Weekly movies')).toBeOnTheScreen();
    expect(screen.getByText('5 votes')).toBeOnTheScreen();
    expect(screen.getByText('Public')).toBeOnTheScreen();
    expect(screen.getByText('Study Group')).toBeOnTheScreen();
    expect(screen.getByText('3 votes')).toBeOnTheScreen(); // default when unset
  });

  it('applies a template when its row is pressed', () => {
    const onApply = jest.fn();
    render(
      <TemplatesModal visible templates={templates} onClose={jest.fn()} onApply={onApply} onDelete={jest.fn()} />
    );
    fireEvent.press(screen.getByLabelText('Use template Movie Night'));
    expect(onApply).toHaveBeenCalledWith(templates[0]);
  });

  it('deletes a template by id', () => {
    const onDelete = jest.fn();
    render(
      <TemplatesModal visible templates={templates} onClose={jest.fn()} onApply={jest.fn()} onDelete={onDelete} />
    );
    fireEvent.press(screen.getByLabelText('Delete template Study Group'));
    expect(onDelete).toHaveBeenCalledWith('t2');
  });

  it('closes from the header button', () => {
    const onClose = jest.fn();
    render(
      <TemplatesModal visible templates={templates} onClose={onClose} onApply={jest.fn()} onDelete={jest.fn()} />
    );
    fireEvent.press(screen.getByLabelText('Close templates'));
    expect(onClose).toHaveBeenCalled();
  });
});
