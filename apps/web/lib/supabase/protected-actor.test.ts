import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeProtectedActor } from './protected-actor';
import {
  protectedBrowserFetch,
  registerProtectedBrowserCleanup,
  resumeProtectedBrowserRequests,
} from './protected-request';

let emit: (event: AuthChangeEvent, session: Session | null) => void;
let unsubscribed: boolean;
const client = {
  auth: {
    onAuthStateChange(callback: typeof emit) {
      emit = callback;
      return {
        data: {
          subscription: {
            unsubscribe() {
              unsubscribed = true;
            },
          },
        },
      };
    },
  },
};
const session = (id: string) => ({ user: { id } }) as Session;
beforeEach(() => {
  unsubscribed = false;
});
afterEach(() => {
  resumeProtectedBrowserRequests();
  vi.unstubAllGlobals();
});

describe('protected browser actor binding', () => {
  it('hides server-rendered private state when logout occurred before hydration', () => {
    let visible = true;
    const unsubscribe = subscribeProtectedActor(client, 'actor-1', () => {
      visible = false;
    });
    emit('INITIAL_SESSION', null);
    expect(visible).toBe(false);
    unsubscribe();
  });
  it('clears the old actor state and stops requests when another account signs in without a signout event', async () => {
    let content = 'private merchant state';
    const destinations: string[] = [];
    const clear = registerProtectedBrowserCleanup(() => {
      content = '';
    });
    const unsubscribe = subscribeProtectedActor(client, 'actor-1', () => {
      content = 'hidden';
      destinations.push('/sign-in');
    });
    emit('SIGNED_IN', session('actor-2'));
    expect(content).toBe('hidden');
    expect(destinations).toEqual(['/sign-in']);
    await expect(protectedBrowserFetch('/api/merchant/application')).rejects.toMatchObject({
      name: 'AbortError',
    });
    unsubscribe();
    clear();
  });

  it('keeps same-actor token refresh and repeated sign-in active', async () => {
    let content = 'visible';
    vi.stubGlobal('fetch', async () => Response.json({ merchant: 'mine' }));
    const unsubscribe = subscribeProtectedActor(client, 'actor-1', () => {
      content = 'hidden';
    });
    emit('TOKEN_REFRESHED', session('actor-1'));
    emit('SIGNED_IN', session('actor-1'));
    expect(await (await protectedBrowserFetch('/api/merchant/application')).json()).toEqual({
      merchant: 'mine',
    });
    expect(content).toBe('visible');
    unsubscribe();
  });

  it('invalidates once for signout and ignores a later session callback from the ended subscription', async () => {
    let ended = 0;
    const unsubscribe = subscribeProtectedActor(client, 'actor-1', () => {
      ended += 1;
    });
    emit('SIGNED_OUT', null);
    emit('SIGNED_IN', session('actor-2'));
    expect(ended).toBe(1);
    await expect(protectedBrowserFetch('/api/merchant/application')).rejects.toMatchObject({
      name: 'AbortError',
    });
    unsubscribe();
  });

  it('unsubscribes and discards late callbacks after the authorized view unmounts', () => {
    let content = 'current view';
    const unsubscribe = subscribeProtectedActor(client, 'actor-1', () => {
      content = 'hidden';
    });
    unsubscribe();
    emit('SIGNED_IN', session('actor-2'));
    expect(unsubscribed).toBe(true);
    expect(content).toBe('current view');
  });
});
