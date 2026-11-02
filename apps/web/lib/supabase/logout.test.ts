import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from './client';
import { signOutBrowser } from './logout';
import { protectedBrowserFetch, protectedBrowserRequestVersion, resumeProtectedBrowserRequests } from './protected-request';

const sdk = vi.hoisted(() => ({ listener: undefined as ((event: string) => void) | undefined,
  signOut: vi.fn(), signOutOptions: undefined as unknown }));
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth: {
  onAuthStateChange(callback: (event: string) => void) { sdk.listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
  signOut: (options: unknown) => { sdk.signOutOptions = options; return sdk.signOut(); },
} }) }));
afterEach(() => { resumeProtectedBrowserRequests(); vi.unstubAllGlobals(); });

describe('SDK browser logout', () => {
  it('handles SDK cross-tab signout by stopping protected requests', async () => {
    createClient();
    sdk.listener!('SIGNED_OUT');
    await expect(protectedBrowserFetch('/api/merchant/booking/workspace')).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('signs out globally through the singleton and drops protected router state with a full navigation', async () => {
    const destinations: string[] = [];
    vi.stubGlobal('window', { location: { replace: (path: string) => destinations.push(path) } });
    sdk.signOut.mockResolvedValue({ error: null });
    await signOutBrowser();
    expect(sdk.signOutOptions).toEqual({ scope: 'global' });
    expect(destinations).toEqual(['/sign-in']);
    await expect(protectedBrowserFetch('/api/merchant/application')).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('reports failed logout and permits an explicit retry without reviving old requests', async () => {
    sdk.signOut.mockResolvedValue({ error: new Error('network') });
    const before = protectedBrowserRequestVersion();
    await expect(signOutBrowser()).rejects.toThrow('Sign out could not be completed. Please retry.');
    expect(protectedBrowserRequestVersion()).toBeGreaterThan(before);
  });
});
