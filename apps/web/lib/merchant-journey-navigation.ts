/** Fixed return destinations; credentials and draft content never enter URLs. */
export function merchantSessionSignInHref(home: boolean): string {
  const destination = home ? '/merchant' : '/merchants/register';
  return `/sign-in?role=merchant&reason=session_expired&next=${encodeURIComponent(destination)}`;
}
