import * as React from 'react';

/**
 * The waitlist.
 *
 * Until now these rows were collected and never read. Every one
 * of them is a person who typed their email in and was told they
 * would hear from us, so the first thing this screen does is say
 * how many of those there are.
 *
 * The second thing it does is more useful. It puts each signup
 * next to the state of the city it was for — because somebody
 * waiting for a city that is already open was told to wait by a
 * form that never checked, and is still waiting now.
 */

export interface WaitlistCityRow {
  city_id: string;
  city_name: string;
  city_status: string;
  waiting: number;
  contactable: number;
  last_30_days: number;
  first_signup: string | null;
  latest_signup: string | null;
  waiting_for_an_open_city: boolean;
}

export interface WaitlistSignupRow {
  id: string;
  email: string;
  city_id: string | null;
  city_name: string | null;
  city_status: string | null;
  source: string | null;
  consent_marketing: boolean;
  created_at: string;
}

const STATUS_TONE: Record<string, string> = {
  live: 'bg-success/10 text-success',
  soft_launch: 'bg-warn/10 text-warn',
  waitlist: 'bg-bg text-muted',
  paused: 'bg-danger/10 text-danger',
};

function when(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
        timeZone: 'Africa/Nairobi',
      })
    : '—';
}

export function WaitlistTab({
  cities,
  signups,
}: {
  cities: WaitlistCityRow[];
  signups: WaitlistSignupRow[];
}) {
  const withPeople = cities.filter((c) => c.waiting > 0);
  const stranded = withPeople.filter((c) => c.waiting_for_an_open_city);
  const total = cities.reduce((a, c) => a + Number(c.waiting), 0);
  const noCity = signups.filter((s) => s.city_id === null);
  const contactable = cities.reduce((a, c) => a + Number(c.contactable), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting" value={total} note="People who left an email" />
        <Stat
          label="Agreed to be contacted"
          value={contactable}
          note={
            total > contactable
              ? `${total - contactable} did not — do not email them`
              : 'All of them'
          }
        />
        <Stat
          label="In the last 30 days"
          value={cities.reduce((a, c) => a + Number(c.last_30_days), 0)}
          note="Recent demand"
        />
        <Stat
          label="No city given"
          value={noCity.length}
          note="Counted separately, not folded into a city"
        />
      </div>

      {stranded.length > 0 ? (
        <div className="border-warn/40 bg-warn/5 rounded-xl border p-4">
          <p className="text-warn text-[0.8125rem] font-extrabold">
            {stranded.reduce((a, c) => a + Number(c.waiting), 0)} people are waiting for a city
            that is already open.
          </p>
          <p className="text-muted mt-1 text-[0.75rem] font-semibold">
            {stranded.map((c) => c.city_name).join(', ')}{' '}
            {stranded.length === 1 ? 'is' : 'are'} live or in soft launch. These signups were taken
            before launch and nothing has gone back to them since. They are the warmest list in the
            product and nobody has written to them.
          </p>
        </div>
      ) : null}

      <section>
        <h3 className="mb-3 text-[0.9375rem] font-extrabold tracking-tight">By city</h3>
        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Waiting</th>
                <th className="px-4 py-2 text-right">Contactable</th>
                <th className="px-4 py-2 text-right">Last 30 days</th>
                <th className="px-4 py-2">First</th>
                <th className="px-4 py-2">Latest</th>
              </tr>
            </thead>
            <tbody>
              {withPeople.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                      Nobody has joined a waitlist yet.
                    </p>
                  </td>
                </tr>
              ) : (
                [...withPeople]
                  .sort((a, b) => Number(b.waiting) - Number(a.waiting))
                  .map((c) => (
                    <tr
                      key={c.city_id}
                      className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                        c.waiting_for_an_open_city ? 'bg-warn/5' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-extrabold">{c.city_name}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                            STATUS_TONE[c.city_status] ?? 'bg-bg text-muted'
                          }`}
                        >
                          {c.city_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-extrabold tabular-nums">
                        {c.waiting}
                      </td>
                      <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                        {c.contactable}
                      </td>
                      <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                        {c.last_30_days}
                      </td>
                      <td className="text-muted px-4 py-2.5 text-[0.75rem]">
                        {when(c.first_signup)}
                      </td>
                      <td className="text-muted px-4 py-2.5 text-[0.75rem]">
                        {when(c.latest_signup)}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-[0.9375rem] font-extrabold tracking-tight">
          Everyone, newest first
        </h3>
        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2">Came from</th>
                <th className="px-4 py-2">May we write?</th>
                <th className="px-4 py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {signups.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                      Nothing here yet.
                    </p>
                  </td>
                </tr>
              ) : (
                signups.map((s) => (
                  <tr
                    key={s.id}
                    className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                  >
                    <td className="px-4 py-2.5 font-extrabold">{s.email}</td>
                    <td className="text-muted px-4 py-2.5">
                      {s.city_name ?? <span className="text-muted-light">not given</span>}
                    </td>
                    <td className="text-muted-light px-4 py-2.5 font-mono text-[0.6875rem]">
                      {s.source ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.consent_marketing ? (
                        <span className="text-success text-[0.6875rem] font-extrabold">Yes</span>
                      ) : (
                        <span className="text-danger text-[0.6875rem] font-extrabold">
                          No — do not email
                        </span>
                      )}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-[0.75rem]">{when(s.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
          Marketing consent is shown on every row because it is the one field here that has legal
          weight. Nothing in this console sends to these addresses; the column exists so that
          whoever does can see it before they act.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="border-border bg-surface rounded-xl border p-4">
      <p className="text-muted-light text-[0.6875rem] font-extrabold tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
      <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">{note}</p>
    </div>
  );
}
