import { describe, expect, it } from 'vitest';
import { EMPTY_CART, fromServerBasket, lineKey, toBasketLines } from './basket-sync';

const USER = 'u-1';

describe('fromServerBasket', () => {
  it('reads an empty basket as an empty cart owned by the user', () => {
    expect(fromServerBasket({ merchant: null, updated_at: null, lines: [] }, USER)).toEqual({
      ...EMPTY_CART,
      owner: USER,
    });
  });

  it('ignores answers it cannot read', () => {
    expect(fromServerBasket(null, USER)).toBeNull();
    expect(fromServerBasket({ merchant: { id: 'm' } }, USER)).toBeNull();
  });

  it('keeps plain lines by item and gives lines with choices their own key', () => {
    const cart = fromServerBasket(
      {
        merchant: { id: 'm-1', name: 'Shop' },
        lines: [
          { line_id: 'l-1', catalogue_item_id: 'i-1', quantity: 2, name: 'Pilau', price_kes: 500 },
          {
            line_id: 'l-2',
            catalogue_item_id: 'i-1',
            quantity: 1,
            name: 'Pilau',
            price_kes: 500,
            note: 'no onions',
            options: [{ group: 'g', choice: 'c' }],
          },
        ],
      },
      USER,
    );
    expect(cart).toEqual({
      merchantId: 'm-1',
      merchantName: 'Shop',
      owner: USER,
      lines: [
        { id: 'i-1', name: 'Pilau', price_kes: 500, quantity: 2 },
        {
          id: 'i-1',
          name: 'Pilau',
          price_kes: 500,
          quantity: 1,
          key: 'l-2',
          choices: { note: 'no onions', options: [{ group: 'g', choice: 'c' }] },
        },
      ],
    });
    expect(cart!.lines.map(lineKey)).toEqual(['i-1', 'l-2']);
  });
});

describe('toBasketLines', () => {
  it('sends each line in the quote item shape, choices included', () => {
    expect(
      toBasketLines([
        { id: 'i-1', name: 'Pilau', price_kes: 500, quantity: 2 },
        {
          id: 'i-2',
          name: 'Cake',
          price_kes: 900,
          quantity: 1,
          key: 'l-9',
          choices: { variant_id: 'v-1', message: 'Happy birthday' },
        },
      ]),
    ).toEqual([
      { catalogue_item_id: 'i-1', quantity: 2 },
      { catalogue_item_id: 'i-2', quantity: 1, variant_id: 'v-1', message: 'Happy birthday' },
    ]);
  });
});
