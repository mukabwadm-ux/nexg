'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import type { Database } from '@nexg/db';

/**
 * Issuing an API key to a developer.
 *
 * The developer is signed in to NexG. We look up whether they are a
 * member of a merchant, and if so the key is bound to that merchant --
 * which is what makes `merchant_read` mean something.
 *
 * A developer with no merchant gets a platform key: public data only.
 * That is the common case for somebody evaluating the API, and it is
 * enough to call every endpoint that exists in stage one.
 */

const RequestSchema = z.object({
  scopes: z
    .array(z.enum(['public_read', 'merchant_read', 'merchant_write']))
    .min(1)
    .max(3),
  merchant_id: z.string().uuid().nullable(),
  rate_limit: z.number().int().min(10).max(600).default(60),
});

export interface IssuedKey {
  rawKey: string;
  keyId: string;
  keyPrefix: string;
  scopes: string[];
  merchantId: string | null;
}

export type IssueResult =
  | { ok: true; key: IssuedKey }
  | { ok: false; message: string; fields?: Record<string, string> };

export async function issueApiKey(formData: FormData): Promise<IssueResult> {
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies().getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookies().set(name, value, options),
            );
          } catch {
            /* Server action: cookies are writable, so this only fires in
               a context where they are not. */
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: 'Sign in to issue a key.' };
  }

  const parsed = RequestSchema.safeParse({
    scopes: formData.getAll('scopes').map(String),
    merchant_id: (formData.get('merchant_id') as string) || null,
    rate_limit: Number(formData.get('rate_limit') ?? 60),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || '_';
      if (!(path in fields)) fields[path] = issue.message;
    }
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'That request was not in a shape we understand.',
      fields,
    };
  }

  const { scopes, merchant_id, rate_limit } = parsed.data;

  /*
   * A key that can read a merchant's records must belong to somebody who
   * is a member of that merchant. Without this check, asking for
   * merchant_read and naming any merchant id would be enough to see it.
   */
  if (merchant_id) {
    const { data: membership } = await supabase
      .from('merchant_user')
      .select('merchant_id')
      .eq('merchant_id', merchant_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return {
        ok: false,
        message: 'You are not a member of that merchant.',
        fields: { merchant_id: 'Not a member of that merchant.' },
      };
    }
  }

  /*
   * merchant_read without a merchant is a key that reads every merchant.
   * The database constraint refuses it too, but refusing it here means
   * the developer is told why rather than being handed a database error.
   */
  if (!merchant_id && scopes.some((s) => s === 'merchant_read' || s === 'merchant_write')) {
    return {
      ok: false,
      message: 'Choose the merchant this key is for.',
      fields: { merchant_id: 'Required for merchant scopes.' },
    };
  }

  /*
   * The generated types describe the schema as it is today; this
   * function arrives with the API authentication migration. The result
   * is read through a narrow local shape rather than through `any`.
   */
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc('fn_api_key_issue', {
    p_merchant_id: merchant_id,
    p_scopes: scopes,
    p_rate_limit: rate_limit,
    p_expires_at: null,
    p_created_by: null,
    p_created_by_user: user.id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { raw_key: string; key_id: string; key_prefix: string }
    | null;

  if (!row) {
    return { ok: false, message: 'The key could not be issued.' };
  }

  return {
    ok: true,
    key: {
      rawKey: row.raw_key,
      keyId: row.key_id,
      keyPrefix: row.key_prefix,
      scopes,
      merchantId: merchant_id,
    },
  };
}