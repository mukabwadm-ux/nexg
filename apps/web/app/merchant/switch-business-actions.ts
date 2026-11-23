'use server';

import { redirect } from 'next/navigation';

import { mayChooseBusiness, rememberBusiness } from '@/lib/current-business';
import { createClient } from '@/lib/supabase/server';

/**
 * Make one of this account's businesses the current one and open its
 * workspace. A business the account does not own or manage is ignored, and
 * the workspace opens on whatever was current before.
 */
export async function switchBusiness(formData: FormData): Promise<void> {
  const merchantId = String(formData.get('merchantId') ?? '').toLowerCase();
  const client = createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous)
    redirect('/merchants/sign-in?reason=workspace-session');
  if (await mayChooseBusiness(client, data.user.id, merchantId)) rememberBusiness(merchantId);
  redirect('/merchant');
}
