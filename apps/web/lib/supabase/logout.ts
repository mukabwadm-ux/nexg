'use client';

import { createClient } from './client';
import { resumeProtectedBrowserRequests, stopProtectedBrowserRequests } from './protected-request';

/** Use the browser singleton so cookie removal also reaches other open tabs. */
export async function signOutBrowser(): Promise<void> {
  stopProtectedBrowserRequests();
  try {
    const { error } = await createClient().auth.signOut({ scope: 'global' });
    if (error) throw error;
  } catch {
    resumeProtectedBrowserRequests();
    throw new Error('Sign out could not be completed. Please retry.');
  }
  // A full navigation drops protected React state and the Next router cache.
  window.location.replace('/sign-in');
}
