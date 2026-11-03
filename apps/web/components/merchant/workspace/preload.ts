'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

// Revisit background preparation before the dev server's 30-minute retention expires.
const PREPARED_FOR_MS = 15 * 60 * 1000;
const prepared = new Map<string, number>();

function isPrepared(href: string) {
  const preparedAt = prepared.get(href);
  return preparedAt !== undefined && Date.now() - preparedAt < PREPARED_FOR_MS;
}
const queued = new Set<string>();
const assets = new Set<string>();
const queue: string[] = [];
let working = false;
let currentPath = '';
let activeRequest: AbortController | undefined;

function stopDevelopmentPages() {
  queue.length = 0;
  queued.clear();
  activeRequest?.abort();
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window)
      window.requestIdleCallback(() => resolve(), { timeout: 750 });
    else setTimeout(resolve, 50);
  });
}

function preloadAssets(html: string) {
  const page = new DOMParser().parseFromString(html, 'text/html');
  const existing = new Set(
    Array.from(
      document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[href]'),
    ).map((element) => (element instanceof HTMLScriptElement ? element.src : element.href)),
  );
  for (const element of page.querySelectorAll('script[src], link[rel="stylesheet"][href]')) {
    const source = element.getAttribute('src') ?? element.getAttribute('href');
    if (!source) continue;
    const url = new URL(source, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/_next/static/'))
      continue;
    if (existing.has(url.href) || assets.has(url.href)) continue;
    assets.add(url.href);
    const hint = document.createElement('link');
    hint.rel = 'prefetch';
    hint.as = element.tagName === 'SCRIPT' ? 'script' : 'style';
    hint.href = url.href;
    document.head.appendChild(hint);
  }
}

async function prepareDevelopmentPages() {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      await idle();
      if (document.visibilityState !== 'visible') {
        stopDevelopmentPages();
        break;
      }
      const href = queue.shift();
      if (!href) continue;
      if (isPrepared(href) || href === currentPath) {
        prepared.set(href, Date.now());
        queued.delete(href);
        continue;
      }
      const controller = new AbortController();
      activeRequest = controller;
      const timeout = window.setTimeout(() => controller.abort(), 90_000);
      try {
        // Next 14 disables router.prefetch in development. Requesting the
        // preview HTML prepares its compiler output and discovers its assets.
        const response = await fetch(href, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (response.ok) {
          preloadAssets(await response.text());
          prepared.set(href, Date.now());
        }
      } catch {
        // Navigation remains available if an idle request is interrupted.
      } finally {
        window.clearTimeout(timeout);
        if (activeRequest === controller) activeRequest = undefined;
        queued.delete(href);
      }
    }
  } finally {
    working = false;
  }
}

function queueDevelopmentPage(href: string, priority = false) {
  if (isPrepared(href)) return;
  if (queued.has(href)) {
    if (priority) {
      const index = queue.indexOf(href);
      if (index >= 0) queue.unshift(...queue.splice(index, 1));
    }
    return;
  }
  queued.add(href);
  if (priority) queue.unshift(href);
  else queue.push(href);
  void prepareDevelopmentPages();
}

export function useWorkspacePreload(destinations: readonly string[]) {
  const router = useRouter();
  const pathname = usePathname();
  const targets = destinations.join('\n');

  const preload = useCallback(
    (href: string) => {
      if (process.env.NODE_ENV === 'development') queueDevelopmentPage(href, true);
      else router.prefetch(href);
    },
    [router],
  );

  useEffect(() => {
    currentPath = pathname ?? '';
    prepared.set(currentPath, Date.now());
    if (process.env.NODE_ENV === 'development') {
      // Compiling every preview page in the background competes with real
      // onboarding. In development, prepare only a destination the merchant
      // points at or focuses, and stop work when the preview is hidden.
      const stopWhenHidden = () => {
        if (document.visibilityState !== 'visible') stopDevelopmentPages();
      };
      document.addEventListener('visibilitychange', stopWhenHidden);
      return () => {
        document.removeEventListener('visibilitychange', stopWhenHidden);
        stopDevelopmentPages();
      };
    }
    let cancelled = false;
    async function prepare() {
      await idle();
      for (const href of targets.split('\n')) {
        if (cancelled) return;
        if (!href || href === currentPath) continue;
        router.prefetch(href);
        await idle();
      }
    }
    const resume = () => {
      if (document.visibilityState === 'visible') void prepare();
    };
    void prepare();
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [pathname, router, targets]);

  return preload;
}
