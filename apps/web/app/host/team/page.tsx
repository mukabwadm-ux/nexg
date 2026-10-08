import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

interface Member {
  user_id: string;
  role: string;
  accepted_at: string | null;
  created_at: string;
  units: string[] | null;
}

/**
 * Who else can see this account.
 *
 * Scope is on every row because an unscoped manager can read
 * every guest arrival across every property, and that is a
 * decision somebody should be able to see they made rather
 * than discover later.
 */
export default async function HostTeamPage() {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const { data } = await supabase
    .from('host_user')
    .select('user_id, role, accepted_at, created_at, units')
    .eq('host_id', me.id)
    .order('created_at');

  const members = (data as Member[] | null) ?? [];
  const pending = members.filter((m) => m.accepted_at === null).length;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/team"
      title="Team"
      lead="Managers and front-desk staff who can see this account. Each can be scoped to particular units."
      headlineValue={String(members.length)}
      headlineNote={pending > 0 ? `${pending} invite not yet accepted` : 'All accepted'}
    >
      <div className="border-border bg-surface overflow-x-auto rounded-xl border">
        <table className="w-full text-left">
          <thead className="border-border bg-bg border-b">
            <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Sees</th>
              <th className="px-4 py-2">Added</th>
              <th className="px-4 py-2">State</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                    Just you.
                  </p>
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr
                  key={m.user_id}
                  className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                >
                  <td className="px-4 py-3 font-extrabold capitalize">{m.role}</td>
                  <td className="text-muted px-4 py-3">
                    {m.units === null || m.units.length === 0
                      ? 'Every unit'
                      : `${m.units.length} unit${m.units.length === 1 ? '' : 's'}`}
                  </td>
                  <td className="text-muted px-4 py-3">
                    {new Date(m.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                      timeZone: 'Africa/Nairobi',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {m.accepted_at ? (
                      <span className="bg-success/10 text-success rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                        Active
                      </span>
                    ) : (
                      <span className="bg-gold-soft text-gold-text rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                        Invite sent
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-muted-light text-[0.75rem] font-semibold leading-[1.7]">
        Inviting a manager goes through the concierge desk for now. An invite grants real access
        to guest arrivals, so it wants a confirmed identity rather than an address anybody can
        type.
      </p>
    </HostSection>
  );
}
