import { Panel, Row } from '@/components/merchant/bits';
import { MerchantPage, merchantContext } from '@/components/merchant/frame';
import { InviteMember, MemberActions, type MemberRow } from '@/components/merchant/team-client';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
};

const CAN: Record<string, string> = {
  owner: 'Everything, including money, team and payout',
  manager: 'Orders, catalogue, hours, disputes, reviews',
  cashier: 'Live orders and sold-out toggles',
};

/**
 * Who else can see this business.
 *
 * An invitation and a membership are listed together because
 * that is the question being asked — who is on this account —
 * but they are different rows and the page says which is which.
 * An invitation grants nothing until it is accepted, and a list
 * that blurred the two would have somebody believe their new
 * manager already has access.
 */
export default async function TeamPage() {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  const supabase = createClient();
  const [memberRes, branchRes] = await Promise.all([
    supabase
      .from('merchant_member_v')
      .select('*')
      .eq('merchant_id', m.merchant_id)
      .order('created_at'),
    supabase
      .from('merchant_branch_list_v')
      .select('id, name')
      .eq('merchant_id', m.merchant_id)
      .order('name'),
  ]);

  const members = (memberRes.data as MemberRow[] | null) ?? [];
  const branches = (branchRes.data as { id: string; name: string }[] | null) ?? [];

  const active = members.filter((x) => x.status === 'active');
  const pending = members.filter((x) => x.status === 'pending');
  const owners = active.filter((x) => x.role === 'owner');

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/team"
      title="Team"
      lead="Owners, managers and cashiers with per-branch access. An invitation grants nothing until the person signs in with it."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-[0.8125rem] font-semibold">
          {active.length} member{active.length === 1 ? '' : 's'}
          {pending.length > 0 ? ` · ${pending.length} invitation pending` : ''}
        </p>
        <InviteMember merchantId={m.merchant_id} branches={branches} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Members">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-border bg-bg border-b">
                  <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                    <th className="px-4 py-2">Member</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Branches</th>
                    <th className="px-4 py-2">Can</th>
                    <th className="px-4 py-2 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                          Nobody but you yet.
                        </p>
                      </td>
                    </tr>
                  ) : null}

                  {members.map((x) => (
                    <tr
                      key={x.user_id ?? x.invite_id}
                      className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                        x.status === 'pending' ? 'bg-warning-bg/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-extrabold">
                          {x.status === 'pending'
                            ? (x.invite_contact ?? 'Invitation')
                            : (x.first_name ?? 'Team member')}
                        </span>
                        <span className="text-muted-light block text-[0.6875rem]">
                          {x.status === 'pending' ? 'Invitation sent' : (x.email ?? '')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                            x.role === 'owner'
                              ? 'bg-gold-soft text-gold-text'
                              : 'bg-bg text-muted'
                          }`}
                        >
                          {ROLE_LABEL[x.role] ?? x.role}
                        </span>
                      </td>
                      <td className="text-muted px-4 py-3">
                        {x.branches === null || x.branches.length === 0
                          ? 'All'
                          : x.branches
                              .map((id) => branches.find((b) => b.id === id)?.name ?? '—')
                              .join(', ')}
                      </td>
                      <td className="text-muted px-4 py-3 text-[0.75rem]">
                        {CAN[x.role] ?? '—'}
                        {x.caps?.see_money ? ' · money' : ''}
                      </td>
                      <td className="px-4 py-3">
                        <MemberActions
                          merchantId={m.merchant_id}
                          member={x}
                          branches={branches}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
              A member scoped to some branches sees only those branches everywhere — orders,
              catalogue, hours and money. Scope is a database rule, not a filter on a page.
            </p>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="What each role can do">
            <Row label="Owner" value="Everything" />
            <Row label="Manager" value="Not money or team" />
            <Row label="Cashier" value="The live queue only" />
            <p className="text-muted-light px-4 py-3 text-[0.6875rem] font-semibold leading-[1.6]">
              A cashier never sees money, whatever else is switched on. The counter phone is a
              cashier, and it sits on a counter all day where anybody can pick it up.
            </p>
          </Panel>

          {owners.length === 1 ? (
            <section className="border-gold/40 bg-gold-soft rounded-xl border p-4">
              <p className="text-[0.875rem] font-extrabold">You are the only owner</p>
              <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.65]">
                If you lose this login, nobody can change payout details or invite anyone. Making
                a second owner takes a minute and is the one piece of housekeeping worth doing
                today.
              </p>
            </section>
          ) : null}

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              What an invitation is
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              A message, and nothing more. It grants no access until that person signs in with
              the number or address it went to. Withdraw it and the link stops working.
            </p>
          </section>
        </aside>
      </div>
    </MerchantPage>
  );
}
