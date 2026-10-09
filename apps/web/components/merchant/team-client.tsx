'use client';

import * as React from 'react';

import {
  inviteMember,
  removeMember,
  revokeInvite,
  updateMember,
} from '@/app/merchant/actions';
import {
  Actions,
  Drawer,
  Field,
  Grid,
  Said,
  Select,
  Submit,
  Text,
  useAction,
} from '@/components/partner/form';

export interface MemberRow {
  user_id: string | null;
  role: string;
  branches: string[] | null;
  caps: Record<string, boolean> | null;
  email: string | null;
  first_name: string | null;
  invite_id: string | null;
  invite_contact: string | null;
  status: string;
  created_at: string;
}

const ROLES = [
  { value: 'owner', label: 'Owner — everything, including money and team' },
  { value: 'manager', label: 'Manager — orders, catalogue, hours, disputes' },
  { value: 'cashier', label: 'Cashier — the live queue and sold-out only' },
];

/**
 * What each role can do, written out.
 *
 * A dropdown that says "Manager" and nothing else makes the
 * person choosing guess, and the guess that costs something is
 * giving a cashier the money pages.
 */
const CAPS: { key: string; label: string; note: string }[] = [
  {
    key: 'see_money',
    label: 'Can see money',
    note: 'Statements, payouts and fees. Off for cashiers whatever else is set.',
  },
  {
    key: 'edit_prices',
    label: 'Can edit catalogue prices',
    note: 'Otherwise they can mark things sold out but not change what they cost.',
  },
  {
    key: 'manage_team',
    label: 'Can manage team',
    note: 'Invite and edit people below their own role.',
  },
];

export function InviteMember({
  merchantId,
  branches,
}: {
  merchantId: string;
  branches: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [contact, setContact] = React.useState('');
  const [role, setRole] = React.useState('manager');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [caps, setCaps] = React.useState<Record<string, boolean>>({});
  const { pending, outcome, run } = useAction();

  const toggleBranch = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white"
      >
        + Invite member
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Invite a member"
        lead="They get a message and join when they sign in with it. Until then they have no access to anything."
      >
        <div className="space-y-4">
          <Grid>
            <Field
              label="Phone or email"
              wide
              hint="However you normally reach them. A phone number gets an SMS; an address gets an email."
            >
              <Text
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="+254 7.. or name@example.com"
              />
            </Field>
            <Field label="Role" wide>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                options={ROLES}
              />
            </Field>
          </Grid>

          <div>
            <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
              Branches
            </p>
            <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold leading-[1.5]">
              Pick none and they see every branch, including ones you add later.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBranch(b.id)}
                  className={`rounded-full px-3 py-1 text-[0.75rem] font-extrabold transition-colors ${
                    picked.includes(b.id)
                      ? 'bg-ink text-white'
                      : 'border-border-strong text-muted border'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {CAPS.map((c) => (
              <label
                key={c.key}
                className="border-border flex cursor-pointer items-start justify-between gap-4 rounded-lg border px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] font-extrabold">{c.label}</span>
                  <span className="text-muted-light mt-0.5 block text-[0.6875rem] font-semibold leading-[1.5]">
                    {c.note}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={caps[c.key] === true}
                  onChange={(e) => setCaps({ ...caps, [c.key]: e.target.checked })}
                  className="accent-gold mt-0.5 h-4 w-4 shrink-0"
                />
              </label>
            ))}
          </div>

          <Said outcome={outcome} />

          <Actions>
            <Submit
              type="button"
              pending={pending}
              onClick={() =>
                run(
                  () =>
                    inviteMember({ merchantId, contact, role, branches: picked, caps }),
                  (o) => {
                    if (o.ok) {
                      setContact('');
                      setPicked([]);
                      setCaps({});
                    }
                  },
                )
              }
            >
              Send invite
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Close
            </Submit>
          </Actions>
        </div>
      </Drawer>
    </>
  );
}

export function MemberActions({
  merchantId,
  member,
  branches,
}: {
  merchantId: string;
  member: MemberRow;
  branches: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [role, setRole] = React.useState(member.role);
  const [picked, setPicked] = React.useState<string[]>(member.branches ?? []);
  const [caps, setCaps] = React.useState<Record<string, boolean>>(member.caps ?? {});
  const save = useAction();
  const gone = useAction();

  /* A pending invitation is withdrawn, not edited — there is
     nobody there to have a role changed. */
  if (member.status === 'pending' && member.invite_id) {
    return (
      <div className="text-right">
        <button
          type="button"
          onClick={() => gone.run(() => revokeInvite(member.invite_id as string))}
          disabled={gone.pending}
          className="border-border-strong text-muted hover:text-danger rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold disabled:opacity-50"
        >
          Withdraw
        </button>
        {gone.outcome?.message ? (
          <p className="text-muted-light mt-1 text-[0.625rem] font-semibold">
            {gone.outcome.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="text-right">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-border-strong text-muted hover:text-ink rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold"
        >
          Edit
        </button>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`${member.first_name ?? 'Team member'}`}
        lead="Role, which branches they see, and what they can do inside them."
      >
        <div className="space-y-4">
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)} options={ROLES} />
          </Field>

          <div>
            <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
              Branches
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() =>
                    setPicked((p) =>
                      p.includes(b.id) ? p.filter((x) => x !== b.id) : [...p, b.id],
                    )
                  }
                  className={`rounded-full px-3 py-1 text-[0.75rem] font-extrabold transition-colors ${
                    picked.includes(b.id)
                      ? 'bg-ink text-white'
                      : 'border-border-strong text-muted border'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {CAPS.map((c) => (
              <label
                key={c.key}
                className="border-border flex cursor-pointer items-start justify-between gap-4 rounded-lg border px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] font-extrabold">{c.label}</span>
                  <span className="text-muted-light mt-0.5 block text-[0.6875rem] font-semibold leading-[1.5]">
                    {c.note}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={caps[c.key] === true}
                  onChange={(e) => setCaps({ ...caps, [c.key]: e.target.checked })}
                  className="accent-gold mt-0.5 h-4 w-4 shrink-0"
                />
              </label>
            ))}
          </div>

          <Said outcome={save.outcome} />

          <Actions>
            <Submit
              type="button"
              pending={save.pending}
              onClick={() =>
                save.run(() =>
                  updateMember({
                    merchantId,
                    userId: member.user_id as string,
                    role,
                    branches: picked,
                    caps,
                  }),
                )
              }
            >
              Save
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Close
            </Submit>
          </Actions>

          <div className="border-border mt-6 border-t pt-5">
            <Said outcome={gone.outcome} />
            <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.6]">
              Removing them takes effect on their next request. The last owner cannot be removed
              — make somebody else an owner first, or the account is one nobody can change payout
              details on.
            </p>
            <div className="mt-3">
              <Submit
                type="button"
                tone="danger"
                pending={gone.pending}
                onClick={() =>
                  gone.run(() => removeMember(merchantId, member.user_id as string))
                }
              >
                Remove from the team
              </Submit>
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
}
