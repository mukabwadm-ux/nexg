export type AuthNavigationRole = 'guest' | 'rider' | 'merchant' | 'host';

export function authRoleFromRequest(role: string | undefined, next?: string): AuthNavigationRole {
  if (role === 'rider' || role === 'merchant' || role === 'host') return role;
  if (
    next === '/merchant' ||
    next?.startsWith('/merchant/') ||
    next === '/merchants/register' ||
    next?.startsWith('/merchants/')
  )
    return 'merchant';
  return 'guest';
}

/**
 * Merchant destinations come from the authenticated account's database-owned
 * workspace. This prevents a stale `/merchants/register` return URL from
 * sending an existing merchant back to onboarding after sign-in.
 */
export function authDestination(
  role: AuthNavigationRole,
  next?: string,
  redirectTo?: string,
): string {
  if (role === 'merchant' && redirectTo) return redirectTo;
  return next ?? redirectTo ?? '/';
}
