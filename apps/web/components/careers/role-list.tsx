'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { ROLES, TEAMS } from '@/content/careers';

/**
 * The open roles.
 *
 * Reads what is actually published: `careers_jobs_v` returns only
 * jobs whose status is open or always_open, so a draft or a closed
 * role cannot appear here however this component is rendered.
 *
 * When nothing is open the designed placeholder rows show instead,
 * under the "these are placeholders" note. A placeholder is not a
 * link — there is no page behind `[Concierge Agent]`, and a row that
 * looks pressable and 404s is worse than one that plainly is not.
 */

export interface OpenRole {
  slug: string | null;
  title: string | null;
  team_name: string | null;
  location_label: string | null;
  work_mode: string | null;
  contract: string | null;
  is_general: boolean | null;
}

const CONTRACT_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract_6mo: '6-mo contract',
  internship: 'Internship',
};

export function RoleList({ roles }: { roles: OpenRole[] }) {
  const live = roles.filter(
    (r): r is OpenRole & { slug: string; title: string } =>
      Boolean(r.slug) && Boolean(r.title) && !r.is_general,
  );

  const teams = [...new Set(live.map((r) => r.team_name).filter(Boolean))] as string[];
  const [filter, setFilter] = React.useState<string>('all');

  const visible = live.filter((role) => {
    if (filter === 'all') return true;
    if (filter === 'remote') {
      return role.work_mode === 'remote_eat' || role.work_mode === 'hybrid';
    }
    return role.team_name === filter;
  });

  /* Nothing published: the artboard's rows, clearly labelled. */
  if (live.length === 0) {
    return (
      <>
        <p className="mt-6 text-[0.8125rem] font-semibold text-[#8A8A8A]">
          Listings below are placeholders until roles are confirmed.
        </p>
        <ul className="border-border mt-4 divide-y rounded-2xl border bg-white">
          {ROLES.slice(0, 6).map((role) => (
            <li key={role.title} className="flex items-center justify-between gap-3 px-5 py-4">
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-extrabold">{role.title}</span>
                <span className="text-muted-light block text-[0.75rem] font-semibold">
                  {TEAMS.find((t) => t.key === role.team)?.name} · {role.location} ·{' '}
                  {role.commitment}
                </span>
              </span>
              {/*
               * The shape of a link and not one. Hidden from assistive
               * technology, which would otherwise announce a control
               * that goes nowhere.
               */}
              <span aria-hidden="true" className="text-muted-light shrink-0">
                <ArrowRight className="h-4 w-4" />
              </span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const FILTERS = [
    { key: 'all', label: 'All roles' },
    ...teams.map((t) => ({ key: t, label: t })),
    { key: 'remote', label: 'Remote-friendly' },
  ];

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

      <ul className="border-border mt-5 divide-y rounded-2xl border bg-white">
        {visible.map((role) => (
          <li key={role.slug}>
            <Link
              href={`/careers/${role.slug}`}
              className="focus-visible:ring-gold hover:bg-bg flex items-center justify-between gap-3 px-5 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-extrabold">{role.title}</span>
                <span className="text-muted-light block text-[0.75rem] font-semibold">
                  {[
                    role.team_name,
                    role.location_label,
                    role.contract ? CONTRACT_LABEL[role.contract] : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <ArrowRight aria-hidden="true" className="text-muted h-4 w-4 shrink-0" />
            </Link>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="text-muted px-5 py-8 text-center text-sm font-semibold">
            Nothing open in that team right now.
          </li>
        )}
      </ul>
    </>
  );
}
