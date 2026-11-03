'use server';

import { z } from 'zod';

import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import { clearedWelcomeMetadata, welcomeMetadata } from '@/lib/merchant-welcome';
import { createClient } from '@/lib/supabase/server';

export interface AuthResult {
  ok: boolean;
  message: string;
  /** Where the caller should go next, decided by the role they picked. */
  redirectTo?: string;
}

export type AccountRole = 'guest' | 'rider' | 'merchant' | 'host';

/*
 * Where each role lands when we have nothing better.
 *
 * The role buttons are a hint, not an answer: somebody who picks
 * "Merchant" may have no application, and somebody who picks
 * "Guest" may be a rider who forgot which button they pressed. So
 * the real destination comes from `fn_partner_home`, which reads
 * what this account actually *is*, and these are only the fallback
 * for an account that is nothing yet.
 */
const START: Record<AccountRole, string> = {
  guest: '/',
  rider: '/riders/apply',
  merchant: '/merchants/apply',
  /*
   * Hosts land on the public page, not an application form.
   * Their onboarding lives inside the portal once an account
   * exists, so the thing a host without one needs is the page
   * that explains what listing involves.
   */
  host: '/hosts',
};

/**
 * Where this account belongs, asked of the database.
 *
 * One answer, shared with every partner page. A merchant who is
 * live lands on their dashboard; one who is half-registered lands
 * back in the form; a rider waiting on a document lands on their
 * dashboard, because that is where the upload is.
 */
async function landingFor(
  supabase: ReturnType<typeof createClient>,
  role: AccountRole,
): Promise<string> {
  const { data } = await supabase.rpc('fn_partner_home');
  const home = (data as { kind?: string; home?: string } | null) ?? null;
  if (home?.home && home.kind !== 'guest' && home.kind !== 'anonymous') return home.home;
  return START[role];
}

const credentials = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(6, 'Passwords are at least 6 characters.'),
});

const recoveryEmail = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
});

const newPassword = z
  .string()
  .min(6, 'Passwords are at least 6 characters.')
  .max(72, 'Password must be 72 characters or fewer.');

const signUpSchema = credentials.extend({
  first_name: z.string().trim().min(1, 'Enter your first name.').max(80),
  last_name: z.string().trim().min(1, 'Enter your last name.').max(80),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid phone number.')
    .optional()
    .or(z.literal('')),
});

function roleOf(value: FormDataEntryValue | null): AccountRole {
  return value === 'rider' || value === 'merchant' || value === 'host' ? value : 'guest';
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });

  if (error) {
    // Not "no such account" versus "wrong password": the first tells anyone
    // who asks which email addresses are registered.
    return { ok: false, message: 'That email and password do not match.' };
  }

  return {
    ok: true,
    message: 'Signed in.',
    redirectTo: await landingFor(supabase, roleOf(formData.get('role'))),
  };
}

export async function requestPasswordRecovery(formData: FormData): Promise<AuthResult> {
  const parsed = recoveryEmail.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Enter a valid email address.',
    };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexgapp.com';
  const redirectTo = new URL('/auth/callback?next=/reset-password', siteUrl).toString();
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email.toLowerCase(), {
    redirectTo,
  });

  if (error) {
    return { ok: false, message: 'We could not send the recovery email. Please try again.' };
  }

  return {
    ok: true,
    message: 'If an account uses that email, a password recovery link is on its way.',
  };
}

export async function sendMerchantPasswordSetupLink(): Promise<AuthResult> {
  if (
    process.env.MERCHANT_ONBOARDING_V1_ENABLED === 'false' ||
    process.env.MERCHANT_EMAIL_OTP_ENABLED === 'false'
  )
    return { ok: false, message: 'Merchant password setup is not available yet.' };

  const supabase = createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const user = auth.user;
  if (authError || !user || user.is_anonymous || !user.email || !user.email_confirmed_at)
    return { ok: false, message: 'Verify your business email before setting up a password.' };

  const { data: home, error: homeError } = await supabase.rpc('fn_partner_home');
  const partner = home as { kind?: string; id?: string } | null;
  if (homeError || partner?.kind !== 'merchant' || !partner.id)
    return { ok: false, message: 'We could not confirm your merchant application. Please contact support.' };

  const rpc = supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  const result = await rpc.call(supabase, 'rpc_merchant_application_read', {
    p_merchant_id: partner.id,
  });
  const application = MerchantApplicationRecord.safeParse(result.data);
  if (
    result.error ||
    !application.success ||
    application.data.review.submitted_revision !== application.data.revision ||
    application.data.review.needs_resubmission ||
    !['pending', 'approved'].includes(application.data.review.state) ||
    application.data.payload.business.email.trim().toLowerCase() !== user.email.trim().toLowerCase()
  )
    return { ok: false, message: 'We could not confirm the submitted application for this email. Please contact support.' };

  // Mark this merchant so the setup email renders as a welcome (greeting,
  // username, "Set your password"). Wording only: if it fails, the plain
  // setup email still goes out.
  await supabase.auth.updateUser({ data: welcomeMetadata(application.data.payload.business) });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexgapp.com';
  const redirectTo = new URL('/auth/callback', siteUrl);
  redirectTo.searchParams.set('next', '/reset-password?next=%2Fmerchant');
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: redirectTo.toString(),
  });
  if (error)
    return { ok: false, message: 'Your application was submitted, but we could not send the password setup link. Please retry.' };

  return { ok: true, message: 'A secure password setup link has been sent to your verified email.' };
}

export async function updateRecoveredPassword(formData: FormData): Promise<AuthResult> {
  const password = newPassword.safeParse(formData.get('password'));
  const confirmation = newPassword.safeParse(formData.get('confirmPassword'));

  if (!password.success) {
    return { ok: false, message: password.error.issues[0]?.message ?? 'Check your new password.' };
  }
  if (!confirmation.success) {
    return {
      ok: false,
      message: confirmation.error.issues[0]?.message ?? 'Confirm your new password.',
    };
  }
  if (password.data !== confirmation.data) {
    return { ok: false, message: 'The passwords do not match.' };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({
    password: password.data,
    // Later reset emails use the normal wording instead of the welcome.
    data: clearedWelcomeMetadata,
  });

  if (error) {
    return {
      ok: false,
      message: 'This recovery link is invalid or has expired. Request a new one.',
    };
  }

  return { ok: true, message: 'Your password has been updated.' };
}

/**
 * Create a guest account.
 *
 * If this browser already holds an anonymous session — which it will for
 * anyone who has started a rider or merchant application — the session is
 * upgraded in place rather than a second user being created. The user id does
 * not change, so the application they started stays theirs and becomes
 * reachable from any device once they have a password. Creating a fresh user
 * instead would silently orphan it.
 */
export async function createAccount(formData: FormData): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    phone: formData.get('phone') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  if (formData.get('accepted') !== 'on') {
    return { ok: false, message: 'Please accept the terms to continue.' };
  }

  const supabase = createClient();
  const email = parsed.data.email.toLowerCase();
  const metadata = {
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.is_anonymous) {
    const { error } = await supabase.auth.updateUser({
      email,
      password: parsed.data.password,
      data: metadata,
    });

    if (error) {
      return {
        ok: false,
        message: error.message.toLowerCase().includes('already')
          ? 'That email is already registered. Sign in instead.'
          : error.message,
      };
    }

    return {
      ok: true,
      message: 'Account created. Anything you had already started is still here.',
      redirectTo: await landingFor(supabase, roleOf(formData.get('role'))),
    };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
    options: { data: metadata },
  });

  if (error) {
    return {
      ok: false,
      message: error.message.toLowerCase().includes('already')
        ? 'That email is already registered. Sign in instead.'
        : error.message,
    };
  }

  return {
    ok: true,
    message: 'Account created.',
    redirectTo: await landingFor(supabase, roleOf(formData.get('role'))),
  };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}
