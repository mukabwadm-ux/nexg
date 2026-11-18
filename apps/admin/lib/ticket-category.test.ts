import { describe, expect, it } from 'vitest';

import { ticketCategory } from './ticket-category';

describe('ticketCategory', () => {
  it('names the category picked on the Ask form', () => {
    expect(ticketCategory({ category: 'airport_transfers', when: 'asap' })).toBe(
      'Airport Transfers',
    );
  });

  it('shows a retired category by the one that replaced it', () => {
    expect(ticketCategory({ category: 'flights' })).toBe('Travels & Tours');
  });

  it('keeps an id it does not know rather than hiding it', () => {
    expect(ticketCategory({ category: 'space_travel' })).toBe('space_travel');
  });

  it('reads the chip older requests carried', () => {
    expect(ticketCategory({ need: 'Laundry', when: 'later' })).toBe('Laundry');
  });

  it('is null when the form asked neither', () => {
    expect(ticketCategory({ from_role: 'guest', topic: 'account' })).toBeNull();
    expect(ticketCategory(null)).toBeNull();
    expect(ticketCategory(['category'])).toBeNull();
    expect(ticketCategory({ category: '  ' })).toBeNull();
  });
});
