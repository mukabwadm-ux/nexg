import { redirect } from 'next/navigation';

/**
 * There is one sign-in page for everybody.
 *
 * This route exists because the header links to it and people bookmark it,
 * but a separate rider login would be a second place to keep correct for no
 * benefit — the role buttons on /sign-in already decide where you land.
 */
export default function RiderSignInRedirect() {
  redirect('/sign-in');
}
