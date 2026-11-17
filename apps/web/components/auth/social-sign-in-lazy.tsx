'use client';

import dynamic from 'next/dynamic';

/**
 * Google and Apple sign-in, loaded only where they are shown (the customer
 * sign-in). PortalSignInPage serves every portal, and Next bundles all the
 * client components a page imports, so a plain import made the merchant,
 * rider and host sign-in pages download the Supabase browser client (about
 * 37 KB compressed) for buttons they never show.
 */
export const LazySocialSignIn = dynamic(() =>
  import('./social-sign-in').then((module) => module.SocialSignIn),
);
