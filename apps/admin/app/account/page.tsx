import type { Metadata } from 'next';

import { ProfileForms, type MyProfile } from '@/components/account/profile-forms';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your profile' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const staff = await requireStaff();
  const supabase = createClient();

  const [{ data: profile }, { data: auth }] = await Promise.all([
    supabase.rpc('rpc_my_staff_profile' as never) as unknown as Promise<{ data: MyProfile | null }>,
    supabase.auth.getUser(),
  ]);

  return (
    <ConsoleShell staff={staff} current="/account">
      <ConsoleHeader title="Your profile" breadcrumb="Account → Profile" />
      <ProfileForms
        profile={
          profile ?? {
            staff_id: staff.staffId,
            email: staff.email,
            display_name: staff.displayName,
            phone: null,
            job_title: null,
            bio: null,
            timezone: 'Africa/Nairobi',
            avatar_path: null,
          }
        }
        avatarUrl={staff.avatarUrl}
        userId={auth.user?.id ?? ''}
        emailDomain={process.env.STAFF_EMAIL_DOMAIN ?? null}
        roleLabel={staff.isSuperAdmin ? 'Super admin' : staff.roles.join(' · ') || 'No role'}
      />
    </ConsoleShell>
  );
}
