import type { SupabaseClient } from '@supabase/supabase-js';

import {
  CODE_PATTERN,
  EMAIL_PATTERN,
  EmailCodeError,
  sendEmailCode,
  verifyEmailCode,
  type EmailCodeWording,
} from './email-code';

/* Email verification inside the host registration form: the shared
   email-code flow (lib/email-code.ts) with host wording. */

export { CODE_PATTERN, EMAIL_PATTERN };
export { EmailCodeError as HostEmailError };

const HOST: EmailCodeWording = {
  exists:
    'This email already has a NexG account. Sign in, or use a different email for your host account.',
  signedInAs: (email) =>
    `You are signed in as ${email}. Sign out to register a host with a different email.`,
};

type Auth = SupabaseClient['auth'];

export function sendHostEmailCode(auth: Auth, email: string) {
  return sendEmailCode(auth, email, HOST);
}

export function verifyHostEmailCode(auth: Auth, userId: string, email: string, code: string) {
  return verifyEmailCode(auth, userId, email, code, HOST);
}
