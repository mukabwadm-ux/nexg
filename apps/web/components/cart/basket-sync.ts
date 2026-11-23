/*
 * The website's side of the account basket (20270216000100, shared services D4).
 *
 * The basket lives in the database against the sign-in, so the website and the
 * phone apps share it. The browser keeps a copy for signed-out visitors and for
 * speed. These helpers turn one into the other; cart-provider decides when.
 */

/** Choices an app may have picked for a line. The website keeps and sends them as they are. */
export interface LineChoices {
  variant_id?: string;
  options?: unknown;
  note?: string;
  message?: string;
}

export interface CartLine {
  /** The catalogue item. */
  id: string;
  name: string;
  /** Whole shillings, as shown on the menu. The server re-prices from the catalogue. */
  price_kes: number;
  quantity: number;
  /** Set on a line with choices (from an app): it is changed by this key, not by `id`. */
  key?: string;
  choices?: LineChoices;
}

export interface CartState {
  merchantId: string | null;
  merchantName: string | null;
  lines: CartLine[];
  /** The sign-in this basket was last saved to; absent while signed out. */
  owner?: string | null;
}

export const EMPTY_CART: CartState = { merchantId: null, merchantName: null, lines: [] };

/** A line's handle for setQuantity: its key when it has choices, otherwise the item. */
export function lineKey(line: CartLine): string {
  return line.key ?? line.id;
}

/** The lines as rpc_basket_put / rpc_basket_merge and rpc_order_quote_web take them. */
export function toBasketLines(lines: CartLine[]): Array<Record<string, unknown>> {
  return lines.map((l) => ({
    catalogue_item_id: l.id,
    quantity: l.quantity,
    ...(l.choices ?? {}),
  }));
}

interface ServerLine {
  line_id?: string;
  catalogue_item_id?: string;
  quantity?: number;
  name?: string;
  price_kes?: number | null;
  variant_id?: string;
  options?: unknown;
  note?: string;
  message?: string;
}

interface ServerBasket {
  merchant?: { id?: string; name?: string } | null;
  lines?: ServerLine[];
}

/** The database's basket as the browser keeps it. Unreadable answers give null. */
export function fromServerBasket(data: unknown, owner: string): CartState | null {
  if (!data || typeof data !== 'object') return null;
  const basket = data as ServerBasket;
  if (!Array.isArray(basket.lines)) return null;
  const merchant = basket.merchant;
  if (!merchant?.id || basket.lines.length === 0) return { ...EMPTY_CART, owner };
  const lines: CartLine[] = [];
  for (const l of basket.lines) {
    if (!l.catalogue_item_id || !l.quantity) continue;
    const choices: LineChoices = {};
    if (l.variant_id) choices.variant_id = l.variant_id;
    if (l.options !== undefined && l.options !== null) choices.options = l.options;
    if (l.note) choices.note = l.note;
    if (l.message) choices.message = l.message;
    const hasChoices = Object.keys(choices).length > 0;
    lines.push({
      id: l.catalogue_item_id,
      name: l.name ?? '',
      price_kes: Number(l.price_kes ?? 0),
      quantity: l.quantity,
      ...(hasChoices
        ? { key: l.line_id ?? `${l.catalogue_item_id}:${lines.length}`, choices }
        : {}),
    });
  }
  return { merchantId: merchant.id, merchantName: merchant.name ?? null, lines, owner };
}
