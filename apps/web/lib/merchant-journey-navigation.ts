/** Fixed return destinations; credentials and draft content never enter URLs. */
export function merchantSessionSignInHref(home: boolean): string {
  const destination = home ? '/merchant' : '/merchants/register';
  return `/merchants/sign-in?reason=session_expired&next=${encodeURIComponent(destination)}`;
}

export function isMerchantRegistrationPath(pathname: string): boolean {
  return pathname === '/merchants/register' || pathname.startsWith('/merchants/register/');
}
