import { describe, expect, it } from 'vitest';

import {
  forgetStartedAnonymous,
  markStartedAnonymous,
  shouldSendSetupLink,
} from './merchant-setup-email';

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const ACTOR = '11111111-1111-4111-8111-111111111111';

describe('the welcome / set-password email after the merchant sign-up', () => {
  it('goes out after verify, save, submit, although the page no longer says anonymous', () => {
    const storage = memory();
    // First render: an anonymous visitor fills in the form.
    markStartedAnonymous(ACTOR, storage);
    // Verifying the email makes the same user permanent; the page re-renders.
    expect(
      shouldSendSetupLink(
        { anonymousSession: false, emailOtpEnabled: true, actorId: ACTOR },
        storage,
      ),
    ).toBe(true);
  });

  it('goes out while the page still says anonymous', () => {
    expect(
      shouldSendSetupLink(
        { anonymousSession: true, emailOtpEnabled: true, actorId: ACTOR },
        memory(),
      ),
    ).toBe(true);
  });

  it('is not sent to someone who signed in with a password before applying', () => {
    expect(
      shouldSendSetupLink(
        { anonymousSession: false, emailOtpEnabled: true, actorId: ACTOR },
        memory(),
      ),
    ).toBe(false);
  });

  it('belongs to that account only, and is forgotten once sent', () => {
    const storage = memory();
    markStartedAnonymous(ACTOR, storage);
    const other = '22222222-2222-4222-8222-222222222222';
    expect(
      shouldSendSetupLink(
        { anonymousSession: false, emailOtpEnabled: true, actorId: other },
        storage,
      ),
    ).toBe(false);
    forgetStartedAnonymous(storage);
    expect(
      shouldSendSetupLink(
        { anonymousSession: false, emailOtpEnabled: true, actorId: ACTOR },
        storage,
      ),
    ).toBe(false);
  });

  it('is never sent while email codes are switched off', () => {
    expect(
      shouldSendSetupLink(
        { anonymousSession: true, emailOtpEnabled: false, actorId: ACTOR },
        memory(),
      ),
    ).toBe(false);
  });
});
