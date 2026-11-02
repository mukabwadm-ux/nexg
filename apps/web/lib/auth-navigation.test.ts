import { describe, expect, it } from 'vitest';

import { authDestination, authRoleFromRequest } from './auth-navigation';

describe('post-auth navigation', () => {
  it('sends an existing merchant to the database-selected portal despite a stale register return URL', () => {
    expect(authDestination('merchant', '/merchants/register', '/merchant')).toBe('/merchant');
  });

  it('returns a merchant without a saved workspace to onboarding', () => {
    expect(authDestination('merchant', '/merchants/register', '/merchants/register')).toBe(
      '/merchants/register',
    );
  });

  it('keeps the requested destination for other account roles', () => {
    expect(authDestination('guest', '/checkout', '/')).toBe('/checkout');
  });

  it('infers merchant intent from an existing merchant return URL without a role query', () => {
    expect(authRoleFromRequest(undefined, '/merchants/register')).toBe('merchant');
  });
});
