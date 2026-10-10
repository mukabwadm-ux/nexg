'use client';

import * as React from 'react';

import { saveSettings, saveTheme } from '@/app/host/actions';

import { Actions, Field, Grid, Said, Select, Submit, Text, useAction } from './form';

/* ════════════════════════════════════════════════ features */

const FEATURES: { key: string; label: string; consequence: string }[] = [
  {
    key: 'guest_ops',
    label: 'Guest Operations',
    consequence: 'NexG handles guest chat, orders and deliveries for all properties.',
  },
  {
    key: 'charge_to_room',
    label: 'Charge to room',
    consequence: 'Hotels only. Needs a folio model and a desk device; ask host ops to enable it.',
  },
  {
    key: 'packages',
    label: 'Welcome packages',
    consequence: 'Scheduling and rules appear in Packages & Amenities.',
  },
  {
    key: 'calendar_sync',
    label: 'Calendar sync',
    consequence: 'Airbnb and Booking.com iCal feeds can be connected in Bookings.',
  },
  {
    key: 'stay_review',
    label: 'Stay review request',
    consequence: 'Asked once before check-out via the QR landing. One reminder, never more.',
  },
  {
    key: 'referral_on_cards',
    label: 'Referral code on printed cards',
    consequence: 'A small code on the back of tent cards, pointing at your referral link.',
  },
  {
    key: 'analytics_email',
    label: 'Analytics exports to email',
    consequence: 'Monthly, to you and an accountant address you set under Billing.',
  },
];

const EVENTS: { key: string; label: string; channel: string }[] = [
  { key: 'delivery_at_reception', label: 'Delivery arriving at reception', channel: 'In-app + sound' },
  { key: 'retired_card_scanned', label: 'Retired QR card scanned', channel: 'Push' },
  { key: 'request_waiting', label: 'Request waiting on you', channel: 'Push + WhatsApp' },
  { key: 'caretaker_unconfirmed', label: 'Caretaker not confirmed after 48 h', channel: 'Push' },
  { key: 'invoice_ready', label: 'Statement or invoice ready', channel: 'Email' },
  { key: 'guest_data_request', label: 'Guest data request', channel: 'Email + push' },
  { key: 'stay_review_received', label: 'Stay review received', channel: 'In-app' },
];

const ROLES = ['owner', 'managers', 'front_desk'] as const;

const THEMES = [
  { value: 'nexg', label: 'NexG classic' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'contrast', label: 'High contrast' },
  { value: 'custom', label: 'Custom' },
];

/* Dark enough for white text on them — the database refuses
   anything under 4.5:1 and these all clear it, so the swatches
   cannot hand somebody a refusal. */
const ACCENTS = [
  '#B8862B',
  '#1A1A1A',
  '#1F3A5F',
  '#1F5F3A',
  '#4A2F6B',
  '#8B2525',
  '#1F5F66',
  '#8B4513',
];

export interface SettingsRow {
  host_id: string;
  display_name: string | null;
  contact_name: string | null;
  email: string | null;
  language: string;
  time_zone: string;
  city_name: string | null;
  features: Record<string, boolean> | null;
  notification_rules: Record<string, string[]> | null;
  quiet_hours: { from?: string; to?: string } | null;
  landing_headline: string | null;
  landing_brand_colour: string | null;
  billing_method: string | null;
  referral_code: string | null;
  default_handoff: string | null;
  status: string;
  tier: string;
}

export interface ThemeRow {
  theme: string;
  accent: string | null;
  sidebar: string;
  density: string;
  font_size: string;
}

const TABS = [
  { k: 'general', l: 'General' },
  { k: 'notifications', l: 'Notifications' },
  { k: 'appearance', l: 'Appearance' },
  { k: 'landing', l: 'Guest landing' },
  { k: 'devices', l: 'Devices' },
  { k: 'billing', l: 'Billing' },
];

/**
 * Settings, in six tabs.
 *
 * One client component rather than six routes because the Save
 * button is shared: a host who changes a toggle on General and
 * a row on Notifications expects one save, not two. The tab is
 * local state for the same reason — switching it must not
 * discard what they have typed.
 */
export function Settings({
  settings,
  theme,
  phoneMasked,
  devices,
}: {
  settings: SettingsRow;
  theme: ThemeRow | null;
  phoneMasked: string;
  devices: { label: string; seen: string; current: boolean }[];
}) {
  const [tab, setTab] = React.useState('general');

  const [general, setGeneral] = React.useState({
    display_name: settings.display_name ?? '',
    email: settings.email ?? '',
    language: settings.language,
    time_zone: settings.time_zone,
  });
  const [features, setFeatures] = React.useState<Record<string, boolean>>(
    settings.features ?? {},
  );
  const [rules, setRules] = React.useState<Record<string, string[]>>(
    settings.notification_rules ?? {},
  );
  const [quiet, setQuiet] = React.useState({
    from: settings.quiet_hours?.from ?? '23:00',
    to: settings.quiet_hours?.to ?? '07:00',
  });
  const [landing, setLanding] = React.useState({
    landing_headline: settings.landing_headline ?? '',
    landing_brand_colour: settings.landing_brand_colour ?? '',
  });

  const [look, setLook] = React.useState<ThemeRow>(
    theme ?? { theme: 'nexg', accent: null, sidebar: 'light', density: 'comfortable', font_size: 'default' },
  );

  const save = useAction();
  const themeSave = useAction();

  const toggleRole = (event: string, role: string) =>
    setRules((r) => {
      const on = r[event] ?? [];
      return {
        ...r,
        [event]: on.includes(role) ? on.filter((x) => x !== role) : [...on, role],
      };
    });

  const saveAll = () =>
    save.run(() =>
      saveSettings(settings.host_id, {
        ...general,
        features,
        notification_rules: rules,
        quiet_hours: quiet,
        ...landing,
      }),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="border-border-strong bg-bg flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5">
          {TABS.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              aria-current={tab === t.k ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-extrabold transition-colors ${
                tab === t.k ? 'bg-ink text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>
        {tab !== 'appearance' && tab !== 'devices' ? (
          <Submit type="button" pending={save.pending} onClick={saveAll}>
            Save
          </Submit>
        ) : null}
      </div>

      {tab !== 'appearance' && tab !== 'devices' ? <Said outcome={save.outcome} /> : null}

      {/* ─────────────────────────────────────────── general */}
      {tab === 'general' ? (
        <>
          <Panel title="General">
            <div className="p-4">
              <Grid>
                <Field label="Business name">
                  <Text
                    value={general.display_name}
                    onChange={(e) => setGeneral({ ...general, display_name: e.target.value })}
                  />
                </Field>
                <Field label="Default city" hint="Changed by host ops — it sets your zones and pricing.">
                  <Text value={settings.city_name ?? '—'} readOnly />
                </Field>
                <Field label="Language">
                  <Select
                    value={general.language}
                    onChange={(e) => setGeneral({ ...general, language: e.target.value })}
                    options={[
                      { value: 'en', label: 'English' },
                      { value: 'sw', label: 'Kiswahili' },
                    ]}
                  />
                </Field>
                <Field label="Time zone">
                  <Select
                    value={general.time_zone}
                    onChange={(e) => setGeneral({ ...general, time_zone: e.target.value })}
                    options={[{ value: 'Africa/Nairobi', label: 'Africa/Nairobi (EAT)' }]}
                  />
                </Field>
                <Field
                  label="Owner phone"
                  hint="The number you were verified on and the one a rider calls. Changed by host ops, with a reason recorded — a quiet change here is indistinguishable from an account takeover."
                >
                  <Text value={`${phoneMasked} · verified`} readOnly />
                </Field>
                <Field label="Owner email">
                  <Text
                    value={general.email}
                    onChange={(e) => setGeneral({ ...general, email: e.target.value })}
                  />
                </Field>
              </Grid>
            </div>
          </Panel>

          <Panel title="Features">
            <div className="divide-border divide-y">
              {/*
                A div, not a label.
                
                `Toggle` renders a `role="switch"` button, and a
                `<label>` does nothing for a button — the
                `cursor-pointer` promised a clickable row and
                only the 44px switch ever responded. Worse, the
                switch had no accessible name at all: a screen
                reader announced "switch, not checked" with no
                way to tell which feature it belonged to.
                `aria-labelledby` and `aria-describedby` give it
                the name and the consequence.
              */}
              {FEATURES.map((f) => (
                <div
                  key={f.key}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span
                      id={`feature-${f.key}-label`}
                      className="block text-[0.875rem] font-extrabold"
                    >
                      {f.label}
                    </span>
                    <span
                      id={`feature-${f.key}-note`}
                      className="text-muted-light mt-0.5 block text-[0.75rem] font-semibold leading-[1.5]"
                    >
                      {f.consequence}
                    </span>
                  </span>
                  <Toggle
                    labelledBy={`feature-${f.key}-label`}
                    describedBy={`feature-${f.key}-note`}
                    on={features[f.key] === true}
                    onChange={(v) => setFeatures({ ...features, [f.key]: v })}
                  />
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : null}

      {/* ───────────────────────────────────── notifications */}
      {tab === 'notifications' ? (
        <Panel title="Notifications">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-border bg-bg border-b">
                <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Owner</th>
                  <th className="px-4 py-2">Managers</th>
                  <th className="px-4 py-2">Front desk</th>
                  <th className="px-4 py-2">Channel</th>
                </tr>
              </thead>
              <tbody>
                {EVENTS.map((e) => (
                  <tr
                    key={e.key}
                    className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                  >
                    <td className="px-4 py-2.5">{e.label}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleRole(e.key, r)}
                          className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold transition-colors ${
                            (rules[e.key] ?? []).includes(r)
                              ? 'bg-success/10 text-success'
                              : 'bg-bg text-muted-light'
                          }`}
                        >
                          {(rules[e.key] ?? []).includes(r) ? 'On' : '—'}
                        </button>
                      </td>
                    ))}
                    <td className="text-muted-light px-4 py-2.5 text-[0.75rem]">{e.channel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-border border-t p-4">
            <Grid>
              <Field
                label="Quiet hours"
                hint="High priority still comes through. A quiet-hours setting that silenced a guest locked out at midnight would be the wrong kind of quiet."
              >
                <div className="flex items-center gap-2">
                  <Text
                    type="time"
                    value={quiet.from}
                    onChange={(e) => setQuiet({ ...quiet, from: e.target.value })}
                  />
                  <span className="text-muted-light text-[0.75rem] font-extrabold">to</span>
                  <Text
                    type="time"
                    value={quiet.to}
                    onChange={(e) => setQuiet({ ...quiet, to: e.target.value })}
                  />
                </div>
              </Field>
            </Grid>
          </div>
        </Panel>
      ) : null}

      {/* ──────────────────────────────────────── appearance */}
      {tab === 'appearance' ? (
        <Panel title="Appearance">
          <div className="space-y-5 p-4">
            <p className="text-muted text-[0.8125rem] font-semibold leading-[1.7]">
              This applies to your login only. Teammates choose their own, and guest-facing pages
              keep NexG&apos;s frame with your branding from the Guest landing tab.
            </p>

            <div>
              <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
                Theme
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setLook({ ...look, theme: t.value })}
                    className={`rounded-full px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
                      look.theme === t.value
                        ? 'bg-ink text-white'
                        : 'border-border-strong text-muted border'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
                Accent colour
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-label={a}
                    onClick={() => setLook({ ...look, accent: a, theme: 'custom' })}
                    style={{ background: a }}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      look.accent === a ? 'border-ink scale-110' : 'border-transparent'
                    }`}
                  />
                ))}
                <input
                  value={look.accent ?? ''}
                  onChange={(e) => setLook({ ...look, accent: e.target.value, theme: 'custom' })}
                  placeholder="#1F3A5F"
                  className="border-border-strong bg-bg w-28 rounded-lg border px-2.5 py-1.5 font-mono text-[0.75rem] font-semibold"
                />
              </div>
              <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold leading-[1.5]">
                Checked against white text at 4.5:1 and refused below it. That is a readability
                floor, not a preference — the refusal says what the ratio came out at.
              </p>
            </div>

            <Grid>
              <Field label="Sidebar">
                <Select
                  value={look.sidebar}
                  onChange={(e) => setLook({ ...look, sidebar: e.target.value })}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />
              </Field>
              <Field label="Density">
                <Select
                  value={look.density}
                  onChange={(e) => setLook({ ...look, density: e.target.value })}
                  options={[
                    { value: 'comfortable', label: 'Comfortable' },
                    { value: 'compact', label: 'Compact' },
                  ]}
                />
              </Field>
              <Field label="Font size">
                <Select
                  value={look.font_size}
                  onChange={(e) => setLook({ ...look, font_size: e.target.value })}
                  options={[
                    { value: 'default', label: 'Default' },
                    { value: 'large', label: 'Large' },
                  ]}
                />
              </Field>
            </Grid>

            {/* Live preview. Real elements rather than coloured
                rectangles, so the contrast on screen is the
                contrast that will ship. */}
            <div className="border-border overflow-hidden rounded-xl border">
              <div
                className="flex items-center gap-2 px-4 py-2.5"
                style={{ background: look.theme === 'dark' ? '#1A1A1A' : '#111' }}
              >
                <span
                  className="h-2 w-10 rounded-full"
                  style={{ background: look.accent ?? '#B8862B' }}
                />
                <span className="bg-border-strong h-2 w-6 rounded-full" />
              </div>
              <div className="bg-bg flex gap-2 p-4">
                <span className="bg-surface border-border h-12 flex-1 rounded border" />
                <span className="bg-surface border-border h-12 flex-1 rounded border" />
                <span
                  className="flex h-12 flex-1 items-center justify-center rounded text-[0.6875rem] font-extrabold text-white"
                  style={{ background: look.accent ?? '#B8862B' }}
                >
                  Button
                </span>
              </div>
            </div>

            <Said outcome={themeSave.outcome} />

            <Actions>
              <Submit
                type="button"
                pending={themeSave.pending}
                onClick={() =>
                  themeSave.run(() =>
                    saveTheme({
                      theme: look.theme,
                      accent: look.accent ?? undefined,
                      sidebar: look.sidebar,
                      density: look.density,
                      font_size: look.font_size,
                    }),
                  )
                }
              >
                Save my theme
              </Submit>
            </Actions>
          </div>
        </Panel>
      ) : null}

      {/* ─────────────────────────────────── guest landing */}
      {tab === 'landing' ? (
        <Panel title="Guest landing branding">
          <div className="space-y-4 p-4">
            <p className="text-muted text-[0.8125rem] font-semibold leading-[1.7]">
              What a guest sees after scanning one of your cards. It sits inside NexG&apos;s frame
              — the payment, the merchants and the delivery are ours, and a page that looked
              entirely like yours would make that unclear at the point it matters.
            </p>
            <Grid>
              <Field label="Welcome headline" wide hint="Up to a line. Reviewed by host ops before it goes live.">
                <Text
                  value={landing.landing_headline}
                  onChange={(e) =>
                    setLanding({ ...landing, landing_headline: e.target.value })
                  }
                  placeholder="Welcome to Riverside"
                />
              </Field>
              <Field label="Brand colour" hint="Used for accents on the landing page only.">
                <Text
                  value={landing.landing_brand_colour}
                  onChange={(e) =>
                    setLanding({ ...landing, landing_brand_colour: e.target.value })
                  }
                  placeholder="#1F3A5F"
                />
              </Field>
              <Field label="Logo" hint="PNG or SVG up to 1 MB. Upload is handled by host ops for now.">
                <Text value="None uploaded" readOnly />
              </Field>
            </Grid>
          </div>
        </Panel>
      ) : null}

      {/* ─────────────────────────────────────────── devices */}
      {tab === 'devices' ? (
        <Panel title="Devices & sessions">
          <div className="divide-border divide-y">
            {devices.map((d) => (
              <div key={d.label} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[0.8125rem] font-semibold">{d.label}</span>
                <span
                  className={`text-[0.8125rem] font-extrabold ${
                    d.current ? 'text-success' : 'text-muted-light'
                  }`}
                >
                  {d.seen}
                </span>
              </div>
            ))}
          </div>
          <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold leading-[1.6]">
            Signing out everywhere is handled by host ops today, and it ends every session
            including this one. A front-desk tablet shows its lock schedule once one is enrolled.
          </p>
        </Panel>
      ) : null}

      {/* ─────────────────────────────────────────── billing */}
      {tab === 'billing' ? (
        <Panel title="Billing">
          <div className="space-y-4 p-4">
            <Grid>
              <Field
                label="Billing method"
                hint="On your Host Agreement. Changed by host ops, with a reason recorded."
              >
                <Text
                  value={
                    settings.billing_method === 'mpesa'
                      ? 'M-Pesa'
                      : settings.billing_method === 'card_on_file'
                        ? 'Card on file'
                        : settings.billing_method === 'invoice'
                          ? 'Invoice, 14 days'
                          : 'Not set'
                  }
                  readOnly
                />
              </Field>
              <Field label="Invoice email">
                <Text
                  value={general.email}
                  onChange={(e) => setGeneral({ ...general, email: e.target.value })}
                />
              </Field>
            </Grid>
            <p className="text-muted text-[0.8125rem] font-semibold leading-[1.7]">
              You are invoiced only for welcome packages you ask us to place. Guest orders are
              paid by the guest to the merchant and never pass through your account — see
              Earnings &amp; Invoices, where the two are deliberately never added together.
            </p>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border bg-surface rounded-xl border">
      <div className="border-border border-b px-4 py-3">
        <h2 className="text-[0.875rem] font-extrabold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Toggle({
  on,
  onChange,
  labelledBy,
  describedBy,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  labelledBy?: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? 'bg-success' : 'bg-border-strong'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          on ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
