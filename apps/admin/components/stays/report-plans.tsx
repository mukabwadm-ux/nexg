'use client';

import { Pause, Pencil, Play, PlusCircle, Save, Trash2 } from 'lucide-react';
import * as React from 'react';

import {
  deleteSavedReport,
  saveSavedReport,
  saveSchedule,
  setSchedule,
} from '@/app/stays/reports/actions';
import {
  ConfirmAction,
  FieldRow,
  FormPanel,
  SelectField,
  TextField,
  useRunner,
} from '@/components/portal/client-kit';
import { HeaderButton } from '@/components/portal/dash';
import {
  FREQUENCIES,
  SAVED_PERIODS,
  type PlanPerson,
  type SavedRow,
  type ScheduleRow,
} from '@/lib/stays-report-plans';
import { REPORTS } from '@/lib/stays-module';

/*
 * The buttons of Stays › Reports › Scheduled and Saved Reports. Each calls a
 * server action in app/stays/reports/actions.ts; the database holds the rules.
 */

const reportOptions = REPORTS.map((r) => ({ value: r.key, label: r.title }));

/* Forwards its ref and props so a popover can open from it. */
const SmallButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: typeof Pause;
    tone?: 'gold' | 'red';
  }
>(function SmallButton({ icon: Icon, children, tone = 'gold', ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={
        'focus-visible:ring-gold inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[0.8125rem] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 ' +
        (tone === 'red'
          ? 'border-[#F2B8B3] bg-[#FFF5F4] text-[#C62D22] hover:bg-[#FDE7E5]'
          : 'border-[#F5D27A] bg-[#FFFBF0] text-[#8A5C00] hover:bg-[#FFF4D6]')
      }
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {children}
    </button>
  );
});

/* ─────────────────────────────────────────────────────────── schedules */

/** Add a scheduled report, or change one when `schedule` is given. */
export function ScheduleForm({
  cities,
  people,
  schedule,
  defaultCity,
}: {
  cities: { id: string; name: string }[];
  people: PlanPerson[];
  schedule?: ScheduleRow;
  defaultCity?: string | null;
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    report: schedule?.report ?? 'bookings',
    cityId: schedule?.city_id ?? defaultCity ?? '',
    frequency: schedule?.frequency ?? 'weekly',
  });
  const [chosen, setChosen] = React.useState<string[]>(schedule?.recipients.map((r) => r.id) ?? []);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  /* Someone chosen before who no longer reaches Stays is shown, so they can be taken off. */
  const listed = [
    ...people,
    ...(schedule?.recipients ?? []).filter((r) => !people.some((p) => p.id === r.id)),
  ];
  return (
    <>
      {schedule ? (
        <SmallButton icon={Pencil} onClick={() => setOpen(true)}>
          Edit
        </SmallButton>
      ) : (
        <HeaderButton icon={PlusCircle} gold onClick={() => setOpen(true)}>
          Schedule a Report
        </HeaderButton>
      )}
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title={schedule ? 'Change the scheduled report' : 'Schedule a report'}
        subtitle="Emailed to the staff you choose at 05:00 Nairobi time, with a link to download it from the console."
        submitLabel={schedule ? 'Save changes' : 'Schedule'}
        busy={busy}
        onSubmit={() => run(() => saveSchedule({ id: schedule?.id, ...form, recipients: chosen }))}
      >
        <SelectField
          label="Report"
          value={form.report}
          onChange={set('report')}
          options={reportOptions}
        />
        <FieldRow>
          <SelectField
            label="City"
            value={form.cityId}
            onChange={set('cityId')}
            placeholder="All cities"
            options={cities.map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectField
            label="How often"
            value={form.frequency}
            onChange={set('frequency')}
            options={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))}
          />
        </FieldRow>
        <fieldset>
          <legend className="text-sm font-bold">
            Send to<span className="text-danger ml-0.5">*</span>
          </legend>
          <p className="text-muted-light mt-0.5 text-xs">
            Staff who can open Stays. Up to 20; reports never go to outside addresses.
          </p>
          <ul className="border-border mt-2 max-h-64 overflow-y-auto rounded-lg border">
            {listed.length === 0 && (
              <li className="text-muted px-3 py-2 text-sm">No staff can open Stays yet.</li>
            )}
            {listed.map((p) => (
              <li key={p.id} className="border-border border-b last:border-b-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#E5A800]"
                    checked={chosen.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="font-semibold">{p.name}</span>
                  {p.email && <span className="text-muted truncate">{p.email}</span>}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </FormPanel>
    </>
  );
}

export function ScheduleControls({ schedule }: { schedule: ScheduleRow }) {
  const { run, busy } = useRunner();
  return (
    <div className="flex flex-wrap gap-1.5">
      <SmallButton
        icon={schedule.active ? Pause : Play}
        disabled={busy}
        onClick={() => run(() => setSchedule(schedule.id, schedule.active ? 'pause' : 'resume'))}
      >
        {schedule.active ? 'Pause' : 'Resume'}
      </SmallButton>
      <ConfirmAction
        trigger={
          <SmallButton icon={Trash2} tone="red" disabled={busy}>
            Delete
          </SmallButton>
        }
        title="Delete this scheduled report?"
        body="Nobody gets it any more. The exports it already sent stay in Exports & History."
        confirmLabel="Delete"
        onConfirm={() => run(() => setSchedule(schedule.id, 'delete'))}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── saved */

/** Save a report's settings, or change saved ones when `saved` is given. */
export function SavedForm({
  cities,
  saved,
  defaults,
}: {
  cities: { id: string; name: string }[];
  saved?: SavedRow;
  defaults: { cityId: string | null; from: string; to: string };
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: saved?.name ?? '',
    report: saved?.report ?? 'bookings',
    cityId: saved?.city_id ?? defaults.cityId ?? '',
    period: saved?.period ?? 'this_month',
    from: saved?.from_date ?? defaults.from,
    to: saved?.to_date ?? defaults.to,
  });
  const [shared, setShared] = React.useState(saved?.shared ?? false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      {saved ? (
        <SmallButton icon={Pencil} onClick={() => setOpen(true)}>
          Edit
        </SmallButton>
      ) : (
        <HeaderButton icon={Save} gold onClick={() => setOpen(true)}>
          Save a Report
        </HeaderButton>
      )}
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title={saved ? 'Change the saved report' : 'Save a report'}
        subtitle="Keep a report, city and period under a name, and run it again in one click."
        submitLabel={saved ? 'Save changes' : 'Save report'}
        busy={busy}
        onSubmit={() => run(() => saveSavedReport({ id: saved?.id, ...form, shared }))}
      >
        <TextField
          label="Name"
          required
          maxLength={80}
          value={form.name}
          onChange={set('name')}
          placeholder="Monthly revenue, Nairobi"
        />
        <SelectField
          label="Report"
          value={form.report}
          onChange={set('report')}
          options={reportOptions}
        />
        <FieldRow>
          <SelectField
            label="City"
            value={form.cityId}
            onChange={set('cityId')}
            placeholder="All cities"
            options={cities.map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectField
            label="Period"
            value={form.period}
            onChange={set('period')}
            options={SAVED_PERIODS.map((p) => ({ value: p.value, label: p.label }))}
          />
        </FieldRow>
        {form.period === 'custom' && (
          <FieldRow>
            <TextField label="From" type="date" required value={form.from} onChange={set('from')} />
            <TextField label="To" type="date" required value={form.to} onChange={set('to')} />
          </FieldRow>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#E5A800]"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
          />
          Share with everyone who can open Stays
        </label>
      </FormPanel>
    </>
  );
}

export function SavedControls({ id }: { id: string }) {
  const { run, busy } = useRunner();
  return (
    <ConfirmAction
      trigger={
        <SmallButton icon={Trash2} tone="red" disabled={busy}>
          Delete
        </SmallButton>
      }
      title="Delete this saved report?"
      body="Only its settings go; the exports already downloaded stay in Exports & History."
      confirmLabel="Delete"
      onConfirm={() => run(() => deleteSavedReport(id))}
    />
  );
}
