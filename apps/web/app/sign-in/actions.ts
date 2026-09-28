'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

export interface AuthResult {
  ok: boolean;
  message: string;
  /** Where the caller should go next, decided by the role they picked. */
  redirectTo?: string;
}

export type AccountRole = 'guest' | 'rider' | 'merchant';

/*
 * Where each role lands.
 *
 * Riders and merchants go to their application, which resumes and shows what
 * is already on file — that is the only thing either of them can do today, and
 * it is genuinely what they came for. Guests go home; there is nothing a guest
 * account unlocks yet beyond not retyping their details.
 */
const HOME: Record<AccountRole, string> = {
  guest: '/',
  rider: '/riders/apply',
  merchant: '/merchants/apply',
};

const credentials = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(6, 'Passwords are at least 6 characters.'),
});

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
  return value === 'rider' || value === 'merchant' ? value : 'guest';
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

  return { ok: true, message: 'Signed in.', redirectTo: HOME[roleOf(formData.get('role'))] };
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
      redirectTo: HOME[roleOf(formData.get('role'))],
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

  return { ok: true, message: 'Account created.', redirectTo: HOME[roleOf(formData.get('role'))] };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}
