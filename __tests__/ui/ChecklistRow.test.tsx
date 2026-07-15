import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ChecklistRow from '../../components/plan-detail/ChecklistRow';

const baseItem = { id: 'item1', text: 'Bring snacks', completedBy: null, addedBy: 'user1' };

describe('ChecklistRow', () => {
  it('renders the item text', () => {
    render(
      <ChecklistRow
        item={baseItem}
        isLast={false}
        completerName={null}
        canDelete={false}
        onToggle={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.getByText('Bring snacks')).toBeOnTheScreen();
  });

  it('calls onToggle with the item id and current completedBy', () => {
    const onToggle = jest.fn();
    render(
      <ChecklistRow
        item={baseItem}
        isLast={false}
        completerName={null}
        canDelete={false}
        onToggle={onToggle}
        onDelete={jest.fn()}
      />
    );
    fireEvent.press(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith('item1', null);
  });

  it('shows who completed a done item and checks the box', () => {
    render(
      <ChecklistRow
        item={{ ...baseItem, completedBy: 'user2' }}
        isLast={false}
        completerName="Sam"
        canDelete={false}
        onToggle={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(screen.getByText('Done by Sam')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { checked: true })).toBeOnTheScreen();
  });

  it('only offers delete when allowed, and reports the item id', () => {
    const onDelete = jest.fn();
    const { rerender } = render(
      <ChecklistRow
        item={baseItem}
        isLast={false}
        completerName={null}
        canDelete={false}
        onToggle={jest.fn()}
        onDelete={onDelete}
      />
    );
    expect(screen.queryByLabelText('Delete checklist item')).toBeNull();

    rerender(
      <ChecklistRow
        item={baseItem}
        isLast={false}
        completerName={null}
        canDelete
        onToggle={jest.fn()}
        onDelete={onDelete}
      />
    );
    fireEvent.press(screen.getByLabelText('Delete checklist item'));
    expect(onDelete).toHaveBeenCalledWith('item1');
  });
});
