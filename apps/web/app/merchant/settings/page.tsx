import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';

import { MerchantSettings } from '@/components/merchant/board-client';
import { merchantContext } from '@/components/merchant/frame';
import type { SettingsIdentity } from '@/components/merchant/settings-artboard/model';
import { SettingsWorkspace } from '@/components/merchant/settings-artboard/workspace';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

interface SettingsRow {
  notification_rules: Record<string, string[]> | null;
  quiet_hours: { from?: string; to?: string } | null;
}
function maskPhone(phone: string | undefined) {
  return phone ? phone.slice(0, 4) + ' ••• ••• ' + phone.slice(-3) : 'Not available';
}
function maskEmail(email: string | undefined) {
  if (!email) return 'Not available';
  const [local, domain] = email.split('@');
  return local?.slice(0, 1) + '••••@' + domain;
}

export default async function SettingsPage(): Promise<ReactNode> {
  const { m, supabase } = await merchantContext();
  if (!m) return null;
  const [{ data, error }, auth] = await Promise.all([
    supabase
      .from('merchant_settings_v')
      .select('notification_rules, quiet_hours')
      .eq('merchant_id', m.merchant_id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (error || !data || !auth.data.user)
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-3xl font-extrabold">Settings</h1>
        <p>Settings could not be loaded. Your existing values have not changed.</p>
        <Link href="/merchant/settings" className="underline">
          Try again
        </Link>
        <br />
        <Link href="/merchant/support" className="underline">
          Contact support
        </Link>
      </div>
    );
  const settings = data as SettingsRow;
  const user = auth.data.user;
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const identity: SettingsIdentity = {
    merchantId: m.merchant_id,
    userId: user.id,
    businessName: m.name,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : 'Your account',
    phone: maskPhone(user.phone),
    email: maskEmail(user.email),
    phoneVerified: Boolean(user.phone_confirmed_at),
    sample: false,
    routing: settings.notification_rules ?? {},
    quiet: settings.quiet_hours,
  };
  return (
    <Suspense
      fallback={
        <p className="p-6" role="status">
          Loading Settings…
        </p>
      }
    >
      <SettingsWorkspace
        identity={identity}
        routingEditor={
          <MerchantSettings
            merchantId={identity.merchantId}
            rules={identity.routing}
            quiet={identity.quiet}
          />
        }
      />
    </Suspense>
  );
}
