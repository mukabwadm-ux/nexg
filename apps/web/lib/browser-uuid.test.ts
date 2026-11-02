import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserUuid } from './browser-uuid';

afterEach(() => vi.unstubAllGlobals());

describe('browserUuid', () => {
  it('creates a v4 UUID when randomUUID is unavailable on an HTTP LAN origin', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0);
        return bytes;
      },
    });

    expect(browserUuid()).toBe('00000000-0000-4000-8000-000000000000');
  });
});
