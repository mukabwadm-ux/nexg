/**
 * Whether a merchant who just submitted the sign-up should get the welcome /
 * set-password email and be signed out, rather than land in /merchant.
 *
 * The visitor starts as an anonymous Supabase user. Verifying the business
 * email turns that same user (same id) into a permanent one, and the page then
 * re-renders with `anonymousSession = false`, so by the time they submit the
 * prop no longer says they came in anonymous. We remember it per account id
 * from the moment it was true. Someone who signed up with a password and then
 * filled in the form never started anonymous, so they are not sent the email.
 */
const KEY = 'nexg.merchant.started-anonymous';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function store(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function markStartedAnonymous(actorId: string, storage: Store | null = store()) {
  try {
    storage?.setItem(KEY, actorId);
  } catch {
    /* Private mode or blocked storage: the prop still covers the same render. */
  }
}

export function startedAnonymous(actorId: string, storage: Store | null = store()): boolean {
  try {
    return Boolean(actorId) && storage?.getItem(KEY) === actorId;
  } catch {
    return false;
  }
}

export function forgetStartedAnonymous(storage: Store | null = store()) {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* Nothing to clean up. */
  }
}

export function shouldSendSetupLink(
  input: { anonymousSession: boolean; emailOtpEnabled: boolean; actorId: string },
  storage: Store | null = store(),
): boolean {
  return (
    input.emailOtpEnabled && (input.anonymousSession || startedAnonymous(input.actorId, storage))
  );
}
