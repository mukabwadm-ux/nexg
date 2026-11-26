'use client';

import { CalendarRange, Percent, Sun } from 'lucide-react';
import * as React from 'react';

import { endSeason, saveSeason, setRateRules } from '@/app/stays/rates-actions';
import {
  ConfirmAction,
  FieldRow,
  FormPanel,
  SelectField,
  TextField,
  useRunner,
} from '@/components/portal/client-kit';
import { HeaderButton } from '@/components/portal/dash';

/*
 * The forms behind weekend, seasonal and long-stay rates. Each goes through
 * app/stays/rates-actions (the RPCs in 20270331000100).
 */

const linkButton =
  'focus-visible:ring-gold font-bold text-[#826D18] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2';

const tileClass =
  'flex h-full min-h-[5.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] p-2.5 text-center text-[0.8125rem] font-bold text-[#8A5C00] hover:bg-[#FFF4D6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold';

const str = (v: number | null | undefined) => (v == null ? '' : String(v));

/** Weekend rate and weekly / monthly discount for one unit. */
export function RateRulesButton({
  unitId,
  label,
  weekend,
  weekly,
  monthly,
  variant = 'link',
}: {
  unitId: string;
  label: string;
  weekend: number | null;
  weekly: number | null;
  monthly: number | null;
  variant?: 'link' | 'panel';
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    weekend: str(weekend),
    weekly: str(weekly),
    monthly: str(monthly),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      {variant === 'panel' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-visible:ring-gold mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 text-[0.875rem] font-bold text-[#8A5C00] hover:bg-[#FFF4D6] focus-visible:outline-none focus-visible:ring-2"
        >
          <Percent aria-hidden="true" className="h-4 w-4" />
          Edit Weekend & Long-Stay Rules
        </button>
      ) : (
        <button type="button" className={linkButton} onClick={() => setOpen(true)}>
          Edit
        </button>
      )}
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title={`Rate rules · ${label}`}
        subtitle="New quotes use these; stays already held or booked keep their price. Leave a field empty for none."
        submitLabel="Save rules"
        busy={busy}
        onSubmit={() =>
          run(() =>
            setRateRules({
              unitId,
              weekend: form.weekend,
              weekly: form.weekly,
              monthly: form.monthly,
            }),
          )
        }
      >
        <TextField
          label="Weekend rate (KES)"
          hint="Friday and Saturday nights. Empty: the standard nightly rate."
          inputMode="numeric"
          value={form.weekend}
          onChange={set('weekend')}
        />
        <FieldRow>
          <TextField
            label="Weekly discount (%)"
            hint="Off the whole stay from 7 nights."
            inputMode="numeric"
            value={form.weekly}
            onChange={set('weekly')}
          />
          <TextField
            label="Monthly discount (%)"
            hint="From 28 nights, instead of the weekly one."
            inputMode="numeric"
            value={form.monthly}
            onChange={set('monthly')}
          />
        </FieldRow>
      </FormPanel>
    </>
  );
}

export interface SeasonValue {
  id?: string;
  name: string;
  startsOn: string;
  endsOn: string;
  adjustPct: string;
  scope: string;
  scopeId: string;
}

export interface ScopeOptions {
  cities: { id: string; label: string }[];
  buildings: { id: string; label: string }[];
  units: { id: string; label: string }[];
}

const EMPTY: SeasonValue = {
  name: '',
  startsOn: '',
  endsOn: '',
  adjustPct: '',
  scope: 'everywhere',
  scopeId: '',
};

/** Add or change a season. `trigger` picks how it opens. */
export function SeasonButton({
  initial,
  options,
  trigger = 'header',
}: {
  initial?: Partial<SeasonValue>;
  options: ScopeOptions;
  trigger?: 'header' | 'link' | 'tile';
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<SeasonValue>({ ...EMPTY, ...initial });
  const set = (k: keyof SeasonValue) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value, ...(k === 'scope' ? { scopeId: '' } : {}) }));
  const scopeList =
    form.scope === 'city'
      ? options.cities
      : form.scope === 'property'
        ? options.buildings
        : form.scope === 'unit'
          ? options.units
          : [];
  /* The unit a tile was opened for may be on a later page; keep it choosable. */
  const listed =
    form.scopeId && !scopeList.some((o) => o.id === form.scopeId)
      ? [{ id: form.scopeId, label: 'This unit' }, ...scopeList]
      : scopeList;
  const editing = Boolean(form.id);
  return (
    <>
      {trigger === 'header' ? (
        <HeaderButton icon={CalendarRange} gold onClick={() => setOpen(true)}>
          New Season
        </HeaderButton>
      ) : trigger === 'tile' ? (
        <button type="button" className={tileClass} onClick={() => setOpen(true)}>
          <Sun aria-hidden="true" className="h-6 w-6" strokeWidth={1.7} />
          Apply Seasonal
        </button>
      ) : (
        <button type="button" className={linkButton} onClick={() => setOpen(true)}>
          Edit
        </button>
      )}
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Change ${form.name || 'season'}` : 'New seasonal price'}
        subtitle="Each night in the season moves by the percentage. The most specific season wins: a unit's over its building's, a building's over its city's, a city's over one for everywhere. Stays already held or booked keep their price."
        submitLabel={editing ? 'Save season' : 'Add season'}
        busy={busy}
        onSubmit={async () => {
          const ok = await run(() => saveSeason(form));
          if (ok && !editing) setForm({ ...EMPTY, ...initial });
          return ok;
        }}
      >
        <TextField
          label="Name"
          required
          maxLength={80}
          placeholder="e.g. December holidays"
          value={form.name}
          onChange={set('name')}
        />
        <FieldRow>
          <TextField
            label="First night"
            type="date"
            required
            value={form.startsOn}
            onChange={set('startsOn')}
          />
          <TextField
            label="Last night"
            type="date"
            required
            value={form.endsOn}
            onChange={set('endsOn')}
          />
        </FieldRow>
        <TextField
          label="Change to the nightly rate (%)"
          hint="20 for 20% more, -15 for 15% less. Between -90 and +300."
          required
          inputMode="numeric"
          value={form.adjustPct}
          onChange={set('adjustPct')}
        />
        <FieldRow>
          <SelectField
            label="Applies to"
            required
            value={form.scope}
            onChange={set('scope')}
            options={[
              { value: 'everywhere', label: 'Every unit' },
              { value: 'city', label: 'A city' },
              { value: 'property', label: 'A building' },
              { value: 'unit', label: 'One unit' },
            ]}
          />
          {form.scope !== 'everywhere' && (
            <SelectField
              label={
                form.scope === 'city' ? 'City' : form.scope === 'property' ? 'Building' : 'Unit'
              }
              required
              value={form.scopeId}
              onChange={set('scopeId')}
              placeholder="Choose…"
              options={listed.map((o) => ({ value: o.id, label: o.label }))}
            />
          )}
        </FieldRow>
      </FormPanel>
    </>
  );
}

/** End a running season; quotes stop using it. */
export function EndSeasonButton({ seasonId, name }: { seasonId: string; name: string }) {
  const { run } = useRunner();
  return (
    <ConfirmAction
      trigger={
        <button type="button" className={linkButton}>
          End
        </button>
      }
      title={`End ${name}?`}
      body="New quotes stop using this season. Stays already held or booked keep their price."
      confirmLabel="End season"
      onConfirm={() => run(() => endSeason(seasonId))}
    />
  );
}
