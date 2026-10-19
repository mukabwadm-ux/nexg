'use client';

import * as React from 'react';

export interface CartLine {
  id: string;
  name: string;
  /** Whole shillings, as shown on the menu. The server re-prices from the catalogue. */
  price_kes: number;
  quantity: number;
}

interface CartState {
  merchantId: string | null;
  merchantName: string | null;
  lines: CartLine[];
}

interface CartApi extends CartState {
  ready: boolean;
  count: number;
  /** For display only; checkout is priced by the database. */
  subtotalKes: number;
  quantityOf: (itemId: string) => number;
  add: (
    merchant: { id: string; name: string },
    line: Omit<CartLine, 'quantity'>,
  ) => 'added' | 'switched';
  setQuantity: (itemId: string, quantity: number) => void;
  clear: () => void;
}

const KEY = 'nexg.cart.v1';
const EMPTY: CartState = { merchantId: null, merchantName: null, lines: [] };

const CartContext = React.createContext<CartApi | null>(null);

function read(): CartState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as CartState;
    if (!parsed || !Array.isArray(parsed.lines)) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<CartState>(EMPTY);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setState(read());
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setState(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const commit = React.useCallback((next: CartState) => {
    setState(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* Private mode: the basket still works for this visit. */
    }
  }, []);

  const api = React.useMemo<CartApi>(() => {
    const count = state.lines.reduce((n, l) => n + l.quantity, 0);
    const subtotalKes = state.lines.reduce((n, l) => n + l.quantity * l.price_kes, 0);
    return {
      ...state,
      ready,
      count,
      subtotalKes,
      quantityOf: (id) => state.lines.find((l) => l.id === id)?.quantity ?? 0,
      add: (merchant, line) => {
        /* A basket is for one shop: a rider collects from one place. */
        if (state.merchantId && state.merchantId !== merchant.id && state.lines.length > 0) {
          commit({
            merchantId: merchant.id,
            merchantName: merchant.name,
            lines: [{ ...line, quantity: 1 }],
          });
          return 'switched';
        }
        const existing = state.lines.find((l) => l.id === line.id);
        commit({
          merchantId: merchant.id,
          merchantName: merchant.name,
          lines: existing
            ? state.lines.map((l) =>
                l.id === line.id ? { ...l, quantity: Math.min(l.quantity + 1, 50) } : l,
              )
            : [...state.lines, { ...line, quantity: 1 }],
        });
        return 'added';
      },
      setQuantity: (id, quantity) => {
        const lines =
          quantity <= 0
            ? state.lines.filter((l) => l.id !== id)
            : state.lines.map((l) =>
                l.id === id ? { ...l, quantity: Math.min(quantity, 50) } : l,
              );
        commit(lines.length > 0 ? { ...state, lines } : EMPTY);
      },
      clear: () => commit(EMPTY),
    };
  }, [state, ready, commit]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>.');
  return ctx;
}

/** "KES 1,450", grouped by hand so server and browser agree. */
export function kes(shillings: number): string {
  return 'KES ' + String(Math.round(shillings)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function kesFromCents(cents: number): string {
  return kes(cents / 100);
}
