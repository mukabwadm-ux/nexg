import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  describeFailure,
  loadTurnstile,
  SCRIPT_BLOCKED,
  SCRIPT_SRC,
  SCRIPT_TIMEOUT,
} from '../app/sign-in/turnstile';

/* Just enough of a page for the loader: a <head> holding script tags. */
const head = {
  scripts: [] as FakeScript[],
  appendChild(script: FakeScript) {
    this.scripts.push(script);
  },
};

class FakeScript {
  src = '';
  async = false;
  dataset: Record<string, string> = {};
  private listeners: Array<() => void> = [];
  addEventListener(_type: 'error', listener: () => void) {
    this.listeners.push(listener);
  }
  remove() {
    head.scripts = head.scripts.filter((script) => script !== this);
  }
  /** What the browser does when a blocker or the network stops the script. */
  fail() {
    const listeners = this.listeners;
    this.listeners = [];
    listeners.forEach((listener) => listener());
  }
}

const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
const page = globalThis as unknown as { turnstile?: typeof api };

beforeEach(() => {
  vi.useFakeTimers();
  head.scripts = [];
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', {
    head,
    createElement: () => new FakeScript(),
    querySelector: (selector: string) =>
      head.scripts.find((script) => selector === `script[src="${script.src}"]`) ?? null,
  });
});

afterEach(() => {
  delete page.turnstile;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("loading Cloudflare's script", () => {
  it('uses the script already on the page', async () => {
    page.turnstile = api;
    await expect(loadTurnstile()).resolves.toBe(api);
    expect(head.scripts).toHaveLength(0);
  });

  it('adds the script once and answers when Turnstile arrives', async () => {
    const loading = loadTurnstile(1_000);
    expect(head.scripts.map((script) => script.src)).toEqual([SCRIPT_SRC]);
    page.turnstile = api;
    vi.advanceTimersByTime(100);
    await expect(loading).resolves.toBe(api);
  });

  it('names a blocked script, and replaces it on the next try', async () => {
    const first = loadTurnstile(1_000);
    head.scripts[0]!.fail();
    await expect(first).rejects.toThrow(SCRIPT_BLOCKED);
    expect(head.scripts[0]!.dataset.failed).toBe('true');

    const second = loadTurnstile(1_000);
    expect(head.scripts).toHaveLength(1);
    expect(head.scripts[0]!.dataset.failed).toBeUndefined();
    page.turnstile = api;
    vi.advanceTimersByTime(100);
    await expect(second).resolves.toBe(api);
  });

  it('gives up on a script that never arrives, instead of waiting for ever', async () => {
    const loading = loadTurnstile(1_000);
    const outcome = expect(loading).rejects.toThrow(SCRIPT_TIMEOUT);
    vi.advanceTimersByTime(1_000);
    await outcome;
  });

  it('waits on a script tag that is still loading rather than adding another', async () => {
    const first = loadTurnstile(1_000);
    const second = loadTurnstile(1_000);
    expect(head.scripts).toHaveLength(1);
    page.turnstile = api;
    vi.advanceTimersByTime(100);
    await expect(Promise.all([first, second])).resolves.toEqual([api, api]);
  });
});

describe('what a failed check tells the visitor', () => {
  it('points at blockers when the script cannot be reached', () => {
    expect(describeFailure(SCRIPT_BLOCKED)).toMatch(/challenges\.cloudflare\.com/);
    expect(describeFailure(SCRIPT_TIMEOUT)).toMatch(/challenges\.cloudflare\.com/);
  });

  it('owns the codes that mean our set-up is wrong', () => {
    expect(describeFailure('110200')).toMatch(/our side/);
    expect(describeFailure('110100')).toMatch(/our side/);
  });

  it('gives general advice for a browser Cloudflare would not pass', () => {
    expect(describeFailure('600010')).toMatch(/could not verify this browser/);
    expect(describeFailure('300030')).toMatch(/could not verify this browser/);
  });
});
