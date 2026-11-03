'use client';

let stopped = false;
let generation = 0;
const requests = new Set<AbortController>();
const cleanup = new Set<() => void>();

/** These are request/cache controls, never a source of merchant authority. */
export function stopProtectedBrowserRequests() {
  stopped = true;
  generation += 1;
  for (const request of requests) request.abort();
  requests.clear();
  for (const clear of cleanup) clear();
}

export function resumeProtectedBrowserRequests() {
  stopped = false;
}

export function protectedBrowserRequestVersion() {
  if (stopped) throw new DOMException('Your session has ended.', 'AbortError');
  return generation;
}

export function assertProtectedBrowserRequestVersion(version: number) {
  if (stopped || generation !== version)
    throw new DOMException('Your session has ended.', 'AbortError');
}

export function registerProtectedBrowserCleanup(clear: () => void) {
  cleanup.add(clear);
  return () => cleanup.delete(clear);
}

/** Abort both the request and response body when the browser session ends. */
export async function protectedBrowserFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (stopped) throw new DOMException('Your session has ended.', 'AbortError');
  const requestGeneration = generation;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  requests.add(controller);
  try {
    const response = await fetch(input, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    const body = response.body ? await response.arrayBuffer() : null;
    if (stopped || generation !== requestGeneration || controller.signal.aborted)
      throw new DOMException('Your session has ended.', 'AbortError');
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    requests.delete(controller);
    init.signal?.removeEventListener('abort', abort);
  }
}
