import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertProtectedBrowserRequestVersion, protectedBrowserFetch, protectedBrowserRequestVersion,
  registerProtectedBrowserCleanup, resumeProtectedBrowserRequests, stopProtectedBrowserRequests } from './protected-request';

afterEach(() => { resumeProtectedBrowserRequests(); vi.unstubAllGlobals(); });

describe('logout request cancellation', () => {
  it('returns the completed authenticated response with private request options', async () => {
    let options: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_input: unknown, init: RequestInit) => {
      options = init;
      return Response.json({ revision: 4 });
    });
    expect(await (await protectedBrowserFetch('/api/merchant/application')).json()).toEqual({ revision: 4 });
    expect(options).toMatchObject({ cache: 'no-store', credentials: 'same-origin' });
  });

  it('rejects an in-flight body after logout even if a failed signout resumes new requests', async () => {
    let finish!: () => void;
    let bodyStarted!: () => void;
    const started = new Promise<void>(resolve => { bodyStarted = resolve; });
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream({ start(controller) {
      finish = () => { controller.enqueue(new TextEncoder().encode('{"private":true}')); controller.close(); };
      bodyStarted();
    } })));
    let cached = 'private';
    const unregister = registerProtectedBrowserCleanup(() => { cached = ''; });
    const request = protectedBrowserFetch('/api/merchant/booking/workspace');
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await started;
    stopProtectedBrowserRequests();
    resumeProtectedBrowserRequests();
    finish();
    await rejection;
    expect(cached).toBe('');
    unregister();
  });

  it('fences SDK follow-up writes across logout and blocks new protected fetches', async () => {
    const version = protectedBrowserRequestVersion();
    stopProtectedBrowserRequests();
    await expect(protectedBrowserFetch('/api/merchant/application')).rejects.toMatchObject({ name: 'AbortError' });
    resumeProtectedBrowserRequests();
    expect(() => assertProtectedBrowserRequestVersion(version)).toThrow('Your session has ended.');
    expect(protectedBrowserRequestVersion()).toBeGreaterThan(version);
  });
});
