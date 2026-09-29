'use client';

import { Button, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { RoleRow } from '@/app/staff/page';
import { inviteStaff } from '@/app/staff/actions';

import { DIRECT_ROLES } from './shared';

/**
 * Adding a colleague.
 *
 * There is no mail provider on this project, so an invitation email is not
 * an option. The password is generated in the database, returned once and
 * shown here — the admin reads it out, and the colleague changes it on
 * first sign-in. It is never stored in plain text and re-opening this
 * dialog will not produce it again, which the copy says out loud.
 */
export function AddStaffDialog({ roles, onClose }: { roles: RoleRow[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>(['concierge_agent']);
  const [issued, setIssued] = React.useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const available = roles.filter((r) => DIRECT_ROLES.includes(r.key));

  const submit = async (formData: FormData) => {
    setBusy(true);
    for (const role of picked) formData.append('roles', role);
    const result = await inviteStaff(formData);
    setBusy(false);

    if (!result.ok) {
      toast({ title: 'Not added', description: result.message, tone: 'danger' });
      return;
    }
    if (result.oneTimePassword) {
      setIssued({
        email: String(formData.get('email') ?? ''),
        password: result.oneTimePassword,
      });
    } else {
      toast({ title: 'Added', description: result.message, tone: 'success' });
      onClose();
    }
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-ink/40 absolute inset-0"
      />
      <div className="border-border bg-surface relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border p-6">
        {issued ? (
          <>
            <h2 className="text-xl font-extrabold tracking-tight">{issued.email} can sign in</h2>
            <p className="text-muted mt-2 text-[0.9375rem] leading-[1.8]">
              Give them this password. It is shown once — closing this box is the last time anyone
              sees it, including you. They should change it after signing in.
            </p>
            <div className="border-border-strong bg-bg mt-4 flex items-center gap-2 rounded-xl border p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-sm font-bold">
                {issued.password}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(issued.password);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="border-warning/40 bg-warning-bg text-warning mt-4 rounded-xl border p-3 text-xs font-bold leading-[1.7]">
              Send it over something that is not email, if you can. There is no password-reset mail
              on this project yet, so if it is lost a super admin has to issue another.
            </p>
            <Button block className="mt-5" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <form action={submit}>
            <h2 className="text-xl font-extrabold tracking-tight">Add staff</h2>
            <p className="text-muted mt-2 text-[0.9375rem] leading-[1.8]">
              A work account on your company domain. The sign-in form refuses anything else.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input id="display_name" name="display_name" label="Full name" required />
              <Input id="email" name="email" type="email" label="Work email" required />
            </div>

            <fieldset className="mt-5">
              <legend className="text-[0.8125rem] font-bold">What they do</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {available.map((role) => {
                  const on = picked.includes(role.key);
                  return (
                    <button
                      key={role.key}
                      type="button"
                      aria-pressed={on}
                      title={role.description ?? undefined}
                      onClick={() =>
                        setPicked(on ? picked.filter((k) => k !== role.key) : [...picked, role.key])
                      }
                      className={`rounded-full px-4 py-2 text-[0.8125rem] font-extrabold transition-colors ${
                        on
                          ? 'bg-ink text-gold'
                          : 'border-border-strong bg-surface text-ink hover:border-ink border'
                      }`}
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-muted-light mt-3 text-xs font-semibold leading-[1.7]">
                Super admin and Finance are not here. Those two are proposed from someone&rsquo;s
                profile and need a second person to accept, so they cannot be handed out on a form.
              </p>
            </fieldset>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="submit"
                loading={busy}
                loadingText="Adding…"
                disabled={picked.length === 0}
              >
                Add them
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
