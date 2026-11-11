'use server';

import { z } from 'zod';

import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import {
  PORTALS,
  isPortal,
  landingFor,
  portalForKind,
  safeNext,
  type PartnerHome,
  type Portal,
} from '@/lib/auth-portals';
import { clearedWelcomeMetadata, welcomeMetadata } from '@/lib/merchant-welcome';
import { createClient } from '@/lib/supabase/server';

/*
 * Turnstile tokens for Supabase's own captcha check (sign-in, sign-up and
 * password reset). The browser adds one per call; Supabase verifies it once
 * captcha is enabled in the project, and ignores it until then.
 */
const CAPTCHA_MESSAGE = 'We could not confirm you are not a bot. Refresh the page and try again.';

function captchaFrom(formData: FormData): string | undefined {
  const value = formData.get('captchaToken');
  return typeof value === 'string' && value ? value : undefined;
}

function cleanToken(token: unknown): string | undefined {
  return typeof token === 'string' && token.length > 0 && token.length < 4096 ? token : undefined;
}

function isCaptchaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'captcha_failed' || /captcha/i.test(error.message ?? '');
}

export interface AuthResult {
  ok: boolean;
  message: string;
  /** Where the caller should go next, decided by the role they picked. */
  redirectTo?: string;
  /** Supabase allows one auth email per address per minute; try again after it. */
  rateLimited?: boolean;
}

async function partnerHome(supabase: ReturnType<typeof createClient>): Promise<PartnerHome> {
  const { data } = await supabase.rpc('fn_partner_home');
  return (data as PartnerHome) ?? null;
}

function portalOf(value: FormDataEntryValue | null): Portal {
  return isPortal(value) ? value : 'customer';
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
    options: { captchaToken: captchaFrom(formData) },
  });

  if (isCaptchaError(error)) return { ok: false, message: CAPTCHA_MESSAGE };
  if (error) {
    // Not "no such account" versus "wrong password": the first tells anyone
    // who asks which email addresses are registered.
    return { ok: false, message: 'That email and password do not match.' };
  }

  const portal = portalOf(formData.get('portal'));
  const home = await partnerHome(supabase);
  const redirectTo = landingFor(portal, home, safeNext(formData.get('next')));
  const partner = portalForKind(home?.kind);
  return {
    ok: true,
    message:
      portal === 'customer' && partner && redirectTo === home?.home
        ? `Signed in. Taking you to your ${PORTALS[partner].label.toLowerCase()} workspace.`
        : 'Signed in.',
    redirectTo,
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
    captchaToken: captchaFrom(formData),
  });

  if (isCaptchaError(error)) return { ok: false, message: CAPTCHA_MESSAGE };
  if (error) {
    return { ok: false, message: 'We could not send the recovery email. Please try again.' };
  }

  return {
    ok: true,
    message: 'If an account uses that email, a password recovery link is on its way.',
  };
}

export async function sendMerchantPasswordSetupLink(captchaToken?: string): Promise<AuthResult> {
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
    return {
      ok: false,
      message: 'We could not confirm your merchant application. Please contact support.',
    };

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
    return {
      ok: false,
      message:
        'We could not confirm the submitted application for this email. Please contact support.',
    };

  // Mark this merchant so the setup email renders as a welcome (greeting,
  // username, "Set your password"). Wording only: if it fails, the plain
  // setup email still goes out.
  await supabase.auth.updateUser({ data: welcomeMetadata(application.data.payload.business) });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexgapp.com';
  const redirectTo = new URL('/auth/callback', siteUrl);
  redirectTo.searchParams.set('next', '/reset-password?next=%2Fmerchant');
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: redirectTo.toString(),
    captchaToken: cleanToken(captchaToken),
  });
  if (isCaptchaError(error)) return { ok: false, message: CAPTCHA_MESSAGE };
  if (error)
    return {
      ok: false,
      message:
        'Your application was submitted, but we could not send the password setup link. Please retry.',
    };

  return {
    ok: true,
    message: 'A secure password setup link has been sent to your verified email.',
  };
}

/**
 * The rider welcome email, after the application is submitted: the same
 * single-use password setup link hosts and merchants get, worded for riders
 * and returning to /rider. The rider confirmed this email with a code during
 * the application, so it is their login from here on.
 */
export async function sendRiderPasswordSetupLink(captchaToken?: string): Promise<AuthResult> {
  const supabase = createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const user = auth.user;
  if (authError || !user || user.is_anonymous || !user.email || !user.email_confirmed_at)
    return { ok: false, message: 'Verify your email before setting up a password.' };

  const { data: home, error: homeError } = await supabase.rpc('fn_partner_home');
  const partner = home as { kind?: string; id?: string } | null;
  if (homeError || partner?.kind !== 'rider' || !partner.id)
    return {
      ok: false,
      message: 'We could not find your rider application. Contact NexG support.',
    };

  const { data: rider, error: riderError } = await supabase
    .from('rider')
    .select('first_name, email, submitted_at')
    .eq('id', partner.id)
    .maybeSingle();
  if (
    riderError ||
    !rider ||
    !rider.submitted_at ||
    rider.email?.trim().toLowerCase() !== user.email.trim().toLowerCase()
  )
    return {
      ok: false,
      message: 'We could not confirm the application for this email. Contact NexG support.',
    };

  await supabase.auth.updateUser({
    data: welcomeMetadata({ firstName: rider.first_name, name: null }, 'rider'),
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexgapp.com';
  const redirectTo = new URL('/auth/callback', siteUrl);
  redirectTo.searchParams.set('next', '/reset-password?next=%2Frider');
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: redirectTo.toString(),
    captchaToken: cleanToken(captchaToken),
  });
  if (isCaptchaError(error)) return { ok: false, message: CAPTCHA_MESSAGE };
  if (error) {
    const rateLimited =
      error.status === 429 || `${error.code ?? ''} ${error.message}`.toLowerCase().includes('rate');
    return {
      ok: false,
      rateLimited,
      message: rateLimited
        ? 'Your welcome email is queued: we can send one email a minute to the same address.'
        : 'Your application is in, but we could not send the welcome email. Use "Forgot password" on the rider sign-in page to get the link.',
    };
  }

  return { ok: true, message: 'Check your inbox for your welcome email and password link.' };
}

/**
 * The host welcome email: the same single-use password setup link merchants
 * get, worded for hosts and returning to /host. Sent only once the applicant
 * has verified the email on their host record.
 */
export async function sendHostPasswordSetupLink(captchaToken?: string): Promise<AuthResult> {
  const supabase = createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const user = auth.user;
  if (authError || !user || user.is_anonymous || !user.email || !user.email_confirmed_at)
    return { ok: false, message: 'Verify your email before setting up a password.' };

  const { data: home, error: homeError } = await supabase.rpc('fn_partner_home');
  const partner = home as { kind?: string; id?: string } | null;
  if (homeError || partner?.kind !== 'host' || !partner.id)
    return { ok: false, message: 'We could not find your host application. Contact NexG support.' };

  const { data: host, error: hostError } = await supabase
    .from('host')
    .select('email, contact_name, display_name')
    .eq('id', partner.id)
    .maybeSingle();
  if (hostError || !host || host.email?.trim().toLowerCase() !== user.email.trim().toLowerCase())
    return {
      ok: false,
      message: 'We could not confirm the application for this email. Contact NexG support.',
    };

  await supabase.auth.updateUser({
    data: welcomeMetadata(
      { firstName: host.contact_name?.split(/\s+/)[0], name: host.display_name },
      'host',
    ),
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexgapp.com';
  const redirectTo = new URL('/auth/callback', siteUrl);
  redirectTo.searchParams.set('next', '/reset-password?next=%2Fhost');
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: redirectTo.toString(),
    captchaToken: cleanToken(captchaToken),
  });
  if (isCaptchaError(error)) return { ok: false, message: CAPTCHA_MESSAGE };
  if (error) {
    const rateLimited =
      error.status === 429 || `${error.code ?? ''} ${error.message}`.toLowerCase().includes('rate');
    return {
      ok: false,
      rateLimited,
      message: rateLimited
        ? 'Your welcome email is queued: we can send one email a minute to the same address.'
        : 'Your account is ready, but we could not send the welcome email. Use "Forgot password" on the sign-in page to get the link.',
    };
  }

  return { ok: true, message: 'Check your inbox for your welcome email and password link.' };
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

  /* Back to where this account belongs: the reset email cannot carry the
     portal it was requested from, but the account itself knows. */
  const home = await partnerHome(supabase);
  const partner = portalForKind(home?.kind);
  return {
    ok: true,
    message: 'Your password has been updated.',
    redirectTo: partner && home?.home ? home.home : undefined,
  };
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
      redirectTo: landingFor(
        formData.get('role') === 'merchant' ? 'merchant' : 'customer',
        await partnerHome(supabase),
        safeNext(formData.get('next')),
      ),
    };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
    options: { data: metadata, captchaToken: captchaFrom(formData) },
  });

  if (isCaptchaError(error)) return { ok: false, message: CAPTCHA_MESSAGE };
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
    redirectTo: landingFor(
      formData.get('role') === 'merchant' ? 'merchant' : 'customer',
      await partnerHome(supabase),
      safeNext(formData.get('next')),
    ),
  };
}

const customerProfile = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(80),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(80),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid phone number, or leave it empty.')
    .optional()
    .or(z.literal('')),
  accepted: z.literal(true, {
    errorMap: () => ({ message: 'Please accept the Terms and Privacy Policy to continue.' }),
  }),
});

/**
 * Finish a customer account created at /sign-up.
 *
 * By now the browser has verified the email with a code (lib/email-code.ts),
 * which turned its anonymous session into a real, confirmed login. This saves
 * the name and phone to the account and sends the welcome email: Supabase's
 * single-use password link, worded as a welcome by the `nexg_welcome_customer`
 * flag, exactly as merchants and hosts get after applying.
 *
 * Safe to call again (a retry after the one-email-a-minute limit): it only
 * updates this user's own metadata and re-sends the link.
 */
export async function completeCustomerSignUp(
  input: { firstName: string; lastName: string; phone?: string | null; accepted: boolean },
  captchaToken?: string,
  /** False saves the details only; the welcome email follows in a second call. */
  sendWelcome = true,
): Promise<AuthResult> {
  const parsed = customerProfile.safeParse({ ...input, phone: input?.phone ?? '' });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the form.' };

  const supabase = createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const user = auth.user;
  if (authError || !user || user.is_anonymous || !user.email || !user.email_confirmed_at)
    return { ok: false, message: 'Verify your email with the code first.' };

  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
      ...welcomeMetadata({ firstName: parsed.data.firstName, name: null }, 'customer'),
    },
  });
  if (updateError)
    return { ok: false, message: 'We could not save your details. Please try again.' };
  if (!sendWelcome) return { ok: true, message: 'Your details are saved.' };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexgapp.com';
  const redirectTo = new URL('/auth/callback', siteUrl);
  redirectTo.searchParams.set('next', '/reset-password');
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: redirectTo.toString(),
    captchaToken: cleanToken(captchaToken),
  });
  if (isCaptchaError(error)) return { ok: false, message: CAPTCHA_MESSAGE };
  if (error) {
    const rateLimited =
      error.status === 429 || `${error.code ?? ''} ${error.message}`.toLowerCase().includes('rate');
    return {
      ok: false,
      rateLimited,
      message: rateLimited
        ? 'Your welcome email is queued: we can send one email a minute to the same address.'
        : 'Your account is ready, but we could not send the welcome email. Use "Forgot password" on the sign-in page to get the link.',
    };
  }
  return { ok: true, message: 'Check your inbox for your welcome email and password link.' };
}

/**
 * Save the name and phone after a first Google or Apple sign-in.
 *
 * No welcome or set-password email: these accounts sign in through their
 * provider. Returns where to go next, the same way a customer sign-in does.
 */
export async function finishOAuthProfile(input: {
  firstName: string;
  lastName: string;
  phone?: string | null;
  accepted: boolean;
  next?: string;
}): Promise<AuthResult> {
  const parsed = customerProfile.safeParse({ ...input, phone: input?.phone ?? '' });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.is_anonymous)
    return { ok: false, message: 'Your session ended. Sign in again.' };
  const { error } = await supabase.auth.updateUser({
    data: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
    },
  });
  if (error) return { ok: false, message: 'We could not save your details. Please try again.' };
  return {
    ok: true,
    message: 'Welcome to NexG.',
    redirectTo: landingFor('customer', await partnerHome(supabase), safeNext(input.next)),
  };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}
