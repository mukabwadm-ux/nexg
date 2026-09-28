'use client';

import { Button } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';

import { ApplyDialog } from '@/components/careers/apply-dialog';
import { type Role, ROLES, TEAMS, type TeamKey } from '@/content/careers';

const FILTERS: { key: TeamKey | 'all' | 'remote'; label: string }[] = [
  { key: 'all', label: 'All roles' },
  ...TEAMS.map((team) => ({ key: team.key, label: team.name })),
  { key: 'remote', label: 'Remote-friendly' },
];

export function RoleList() {
  const [filter, setFilter] = React.useState<TeamKey | 'all' | 'remote'>('all');
  const [applying, setApplying] = React.useState<Role | null>(null);
  const [openApplication, setOpenApplication] = React.useState(false);

  const visible = ROLES.filter((role) => {
    if (filter === 'all') return true;
    // "Remote-friendly" is a property of the location text, not a team.
    if (filter === 'remote') return /remote/i.test(role.location);
    return role.team === filter;
  });

  const teamName = (key: TeamKey) => TEAMS.find((team) => team.key === key)?.name ?? key;

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            aria-pressed={filter === option.key}
            className={`rounded-full border px-4 py-2 text-[0.8125rem] font-bold transition-colors ${
              filter === option.key
                ? 'border-ink bg-ink text-white'
                : 'border-border-strong bg-surface text-ink hover:border-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ul className="mt-5 space-y-2.5">
        {visible.length === 0 ? (
          <li className="text-muted-light py-8 text-center text-sm font-semibold">
            Nothing open in that team right now.
          </li>
        ) : (
          visible.map((role) => (
            <li key={role.title}>
              <button
                type="button"
                onClick={() => setApplying(role)}
                className="border-border bg-surface hover:border-border-strong focus-visible:ring-gold flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
              >
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-extrabold">{role.title}</span>
                  <span className="text-muted-light block text-xs font-semibold">
                    {teamName(role.team)}
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-muted-light hidden text-xs font-semibold sm:block">
                    {role.location} · {role.commitment}
                  </span>
                  <span
                    aria-hidden="true"
                    className="bg-bg text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="bg-gold-soft border-gold/30 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <span>
          <span className="block text-[0.875rem] font-extrabold">Don’t see your role?</span>
          <span className="text-muted block text-xs font-semibold">
            Tell us what you’d do here. We read every open application and keep the good ones on
            file for the next city.
          </span>
        </span>
        <Button size="sm" variant="gold" onClick={() => setOpenApplication(true)}>
          Send an open application
        </Button>
      </div>

      <ApplyDialog
        roleTitle={applying?.title ?? ''}
        {...(applying ? { team: teamName(applying.team) } : {})}
        open={applying !== null}
        onClose={() => setApplying(null)}
      />
      <ApplyDialog
        roleTitle="Open application"
        open={openApplication}
        onClose={() => setOpenApplication(false)}
      />
    </>
  );
}
