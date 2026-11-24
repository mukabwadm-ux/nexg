'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  type CartLine,
  type CartState,
  EMPTY_CART as EMPTY,
  fromServerBasket,
  lineKey,
  toBasketLines,
} from './basket-sync';

export type { CartLine } from './basket-sync';

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
  /**
   * Several lines from one merchant in one go, each with a quantity (a dish
   * and the extras picked with it). Same one-shop rule as add.
   */
  addLines: (merchant: { id: string; name: string }, lines: CartLine[]) => 'added' | 'switched';
  /** By the line's key: the item id, or the key of a line with choices (lineKey). */
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
}

const KEY = 'nexg.cart.v1';
/** How long to wait after the last change before saving the basket to the account. */
const SAVE_DELAY_MS = 400;

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

function write(next: CartState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode: the basket still works for this visit. */
  }
}

type BasketRpc = (
  fn: 'rpc_basket_get' | 'rpc_basket_put' | 'rpc_basket_merge',
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

function basketRpc(): BasketRpc {
  const supabase = createClient();
  return (fn, args) =>
    Promise.resolve(supabase.rpc(fn as never, (args ?? {}) as never)) as unknown as Promise<{
      data: unknown;
      error: unknown;
    }>;
}

/*
 * The basket is kept on the account (shared services D4), so the website and
 * the phone apps show the same one. Signed out, it stays in this browser; at
 * sign-in it is merged into the account's basket. Every change while signed in
 * is saved to the account shortly after.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<CartState>(EMPTY);
  const [ready, setReady] = React.useState(false);
  /** The signed-in user the basket is saved to, or null. */
  const userRef = React.useRef<string | null>(null);
  /** Bumped on every local change, so a slow answer from the server never overwrites a newer edit. */
  const versionRef = React.useRef(0);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const adopt = React.useCallback((next: CartState) => {
    setState(next);
    write(next);
  }, []);

  const save = React.useCallback((snapshot: CartState) => {
    const user = userRef.current;
    if (!user) return;
    void basketRpc()('rpc_basket_put', {
      p_merchant_id: snapshot.lines.length > 0 ? snapshot.merchantId : null,
      p_lines: toBasketLines(snapshot.lines),
    }).catch(() => {
      /* Offline: the browser copy is kept and saved with the next change. */
    });
  }, []);

  const commit = React.useCallback(
    (next: CartState) => {
      versionRef.current += 1;
      const owned = { ...next, owner: userRef.current };
      adopt(owned);
      if (!userRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        save(owned);
      }, SAVE_DELAY_MS);
    },
    [adopt, save],
  );

  React.useEffect(() => {
    setState(read());
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setState(read());
    };
    window.addEventListener('storage', onStorage);
    /* Leaving the page with a save still waiting: send it now. */
    const onPageHide = () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      save(read());
    };
    window.addEventListener('pagehide', onPageHide);

    let cancelled = false;
    const supabase = createClient();

    /* Bring the browser's basket and the account's together for this sign-in. */
    const sync = async (userId: string | null) => {
      const local = read();
      if (!userId) {
        userRef.current = null;
        /* Signed out: the basket belonged to the account, so it leaves with it. */
        if (local.owner) adopt(EMPTY);
        return;
      }
      if (userRef.current === userId) return;
      userRef.current = userId;
      const started = versionRef.current;
      const rpc = basketRpc();
      const answer =
        local.owner !== userId && local.lines.length > 0 && local.merchantId
          ? await rpc('rpc_basket_merge', {
              p_merchant_id: local.merchantId,
              p_lines: toBasketLines(local.lines),
            })
          : await rpc('rpc_basket_get');
      if (cancelled || answer.error) return;
      if (versionRef.current !== started) {
        /* The basket changed while we waited (checkout emptied it, say): this browser's is newer. */
        save(read());
        return;
      }
      const server = fromServerBasket(answer.data, userId);
      if (server) adopt(server);
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => sync(data.session?.user.id ?? null))
      .catch(() => undefined);
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        void sync(session?.user.id ?? null).catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', onPageHide);
      listener.subscription.unsubscribe();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [adopt, save]);

  const api = React.useMemo<CartApi>(() => {
    const count = state.lines.reduce((n, l) => n + l.quantity, 0);
    const subtotalKes = state.lines.reduce((n, l) => n + l.quantity * l.price_kes, 0);
    const plain = (l: CartLine, id: string) => !l.key && l.id === id;
    return {
      ...state,
      ready,
      count,
      subtotalKes,
      quantityOf: (id) => state.lines.find((l) => plain(l, id))?.quantity ?? 0,
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
        const existing = state.lines.find((l) => plain(l, line.id));
        commit({
          merchantId: merchant.id,
          merchantName: merchant.name,
          lines: existing
            ? state.lines.map((l) =>
                plain(l, line.id) ? { ...l, quantity: Math.min(l.quantity + 1, 50) } : l,
              )
            : [...state.lines, { ...line, quantity: 1 }],
        });
        return 'added';
      },
      addLines: (merchant, incoming) => {
        const wanted = incoming.filter((l) => l.quantity > 0);
        if (wanted.length === 0) return 'added';
        const switched =
          !!state.merchantId && state.merchantId !== merchant.id && state.lines.length > 0;
        const lines = switched ? [] : [...state.lines];
        for (const line of wanted) {
          const at = lines.findIndex((l) => plain(l, line.id));
          if (at >= 0) {
            lines[at] = {
              ...lines[at]!,
              quantity: Math.min(lines[at]!.quantity + line.quantity, 50),
            };
          } else {
            lines.push({ ...line, quantity: Math.min(line.quantity, 50) });
          }
        }
        commit({ merchantId: merchant.id, merchantName: merchant.name, lines });
        return switched ? 'switched' : 'added';
      },
      setQuantity: (key, quantity) => {
        const lines =
          quantity <= 0
            ? state.lines.filter((l) => lineKey(l) !== key)
            : state.lines.map((l) =>
                lineKey(l) === key ? { ...l, quantity: Math.min(quantity, 50) } : l,
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

/** The cart where there is one, or null on a page outside <CartProvider> (Discovery). */
export function useOptionalCart(): CartApi | null {
  return React.useContext(CartContext);
}

/** "KES 1,450", grouped by hand so server and browser agree. */
export function kes(shillings: number): string {
  return 'KES ' + String(Math.round(shillings)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function kesFromCents(cents: number): string {
  return kes(cents / 100);
}
