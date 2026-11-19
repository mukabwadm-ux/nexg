'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { Outcome } from '@/app/merchant/actions';
import {
  saveOptionGroup,
  setItemOptionGroups,
  setItemUnit,
  type ItemUnitInput,
  type OptionGroupInput,
} from '@/app/merchant/menu/choices-actions';

import { Panel } from './bits';

export interface OptionGroupRow {
  id: string;
  name: string;
  required: boolean;
  max_choices: number;
  options: { id: string; name: string; extra_cents: number; available: boolean }[];
}

export interface ChoiceItemRow {
  id: string;
  name: string;
  price_kes: number;
  sold_by?: string | null;
  unit_label?: string | null;
  unit_step?: number | null;
  unit_min?: number | null;
  unit_max?: number | null;
  price_is_estimate?: boolean | null;
  group_ids: string[];
}

const input =
  'border-border bg-surface focus:border-gold rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold outline-none';
const button =
  'bg-gold text-ink rounded-lg px-3 py-2 text-[0.6875rem] font-extrabold disabled:opacity-40';
const quiet =
  'border-border-strong text-muted rounded-lg border px-3 py-2 text-[0.6875rem] font-extrabold disabled:opacity-40';

function toDraft(group?: OptionGroupRow): OptionGroupInput {
  return group
    ? {
        id: group.id,
        name: group.name,
        required: group.required,
        maxChoices: group.max_choices,
        options: group.options.map((o) => ({
          id: o.id,
          name: o.name,
          extraKes: Math.round(o.extra_cents / 100),
          available: o.available,
        })),
      }
    : {
        name: '',
        required: false,
        maxChoices: 1,
        options: [{ name: '', extraKes: 0, available: true }],
      };
}

/**
 * Choices, add-ons and units.
 *
 * A group ("Size", "Extras") is written once and put on any item. Checkout
 * adds each chosen option's price to the line. An item sold by weight is
 * priced per unit (per kg) and bought in steps (0.5 kg).
 */
export function ItemChoices({
  groups,
  items,
}: {
  groups: OptionGroupRow[];
  items: ChoiceItemRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const [editing, setEditing] = React.useState<OptionGroupInput | null>(null);

  const run = async (key: string, action: () => Promise<Outcome>) => {
    setBusy(key);
    setSaid(null);
    const r = await action();
    setSaid(r);
    setBusy(null);
    if (r.ok) router.refresh();
    return r;
  };

  return (
    <Panel
      title="Choices, add-ons and units"
      note="Sizes, extras and per-kg pricing, shown in the app and priced at checkout"
    >
      {said && (
        <p
          role="status"
          className={`mb-3 rounded-lg px-3 py-2 text-[0.75rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message}
        </p>
      )}

      <h3 className="mb-2 text-[0.8125rem] font-extrabold">Groups</h3>
      <ul className="divide-border mb-3 divide-y">
        {groups.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <p className="text-[0.8125rem] font-bold">
              {g.name}
              <span className="text-muted ml-2 text-[0.6875rem] font-semibold">
                {g.required ? 'Required' : 'Optional'} · up to {g.max_choices} ·{' '}
                {g.options
                  .map((o) => `${o.name}${o.extra_cents ? ` +${o.extra_cents / 100}` : ''}`)
                  .join(', ')}
              </span>
            </p>
            <div className="flex gap-2">
              <button type="button" className={quiet} onClick={() => setEditing(toDraft(g))}>
                Edit
              </button>
              <button
                type="button"
                className={quiet}
                disabled={busy === `x${g.id}`}
                onClick={() => {
                  if (window.confirm(`Remove ${g.name} from every item?`))
                    void run(`x${g.id}`, () => saveOptionGroup({ ...toDraft(g), archived: true }));
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing ? (
        <GroupEditor
          draft={editing}
          setDraft={setEditing}
          busy={busy === 'group'}
          onSave={async () => {
            const r = await run('group', () => saveOptionGroup(editing));
            if (r.ok) setEditing(null);
          }}
        />
      ) : (
        <button type="button" className={quiet} onClick={() => setEditing(toDraft())}>
          New group
        </button>
      )}

      <h3 className="mb-2 mt-5 text-[0.8125rem] font-extrabold">Items</h3>
      <ul className="divide-border divide-y">
        {items.map((i) => (
          <ItemRow key={i.id} item={i} groups={groups} busy={busy} run={run} />
        ))}
      </ul>
    </Panel>
  );
}

function GroupEditor({
  draft,
  setDraft,
  busy,
  onSave,
}: {
  draft: OptionGroupInput;
  setDraft: (d: OptionGroupInput | null) => void;
  busy: boolean;
  onSave: () => void;
}) {
  const setOption = (n: number, patch: Partial<OptionGroupInput['options'][number]>) =>
    setDraft({
      ...draft,
      options: draft.options.map((o, i) => (i === n ? { ...o, ...patch } : o)),
    });
  return (
    <div className="border-border space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Group name"
          placeholder="Size, Extras, Sauce"
          className={`${input} flex-1`}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <label className="flex items-center gap-1 text-[0.75rem] font-bold">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
          />
          Required
        </label>
        <label className="flex items-center gap-1 text-[0.75rem] font-bold">
          Up to
          <input
            aria-label="Most a customer can choose"
            inputMode="numeric"
            className={`${input} w-14 text-right`}
            value={String(draft.maxChoices)}
            onChange={(e) =>
              setDraft({ ...draft, maxChoices: Number(e.target.value.replace(/\D/g, '')) || 1 })
            }
          />
        </label>
      </div>
      {draft.options.map((o, n) => (
        <div key={o.id ?? `new-${n}`} className="flex flex-wrap items-center gap-2">
          <input
            aria-label={`Option ${n + 1} name`}
            placeholder="Large, Extra cheese"
            className={`${input} flex-1`}
            value={o.name}
            onChange={(e) => setOption(n, { name: e.target.value })}
          />
          <span className="text-muted-light text-[0.6875rem] font-bold">+ KES</span>
          <input
            aria-label={`Option ${n + 1} extra price`}
            inputMode="numeric"
            className={`${input} w-20 text-right tabular-nums`}
            value={String(o.extraKes)}
            onChange={(e) =>
              setOption(n, { extraKes: Number(e.target.value.replace(/\D/g, '')) || 0 })
            }
          />
          <label className="flex items-center gap-1 text-[0.75rem] font-bold">
            <input
              type="checkbox"
              checked={o.available}
              onChange={(e) => setOption(n, { available: e.target.checked })}
            />
            On
          </label>
          <button
            type="button"
            aria-label={`Remove option ${n + 1}`}
            className="text-muted hover:text-danger px-1 text-lg leading-none"
            onClick={() => setDraft({ ...draft, options: draft.options.filter((_, i) => i !== n) })}
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={quiet}
          onClick={() =>
            setDraft({
              ...draft,
              options: [...draft.options, { name: '', extraKes: 0, available: true }],
            })
          }
        >
          Add option
        </button>
        <button type="button" className={button} disabled={busy} onClick={onSave}>
          {busy ? '…' : 'Save group'}
        </button>
        <button type="button" className={quiet} onClick={() => setDraft(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  groups,
  busy,
  run,
}: {
  item: ChoiceItemRow;
  groups: OptionGroupRow[];
  busy: string | null;
  run: (key: string, action: () => Promise<Outcome>) => Promise<Outcome>;
}) {
  const [picked, setPicked] = React.useState<string[]>(item.group_ids);
  const [unit, setUnit] = React.useState<ItemUnitInput>({
    soldBy: (item.sold_by as ItemUnitInput['soldBy']) ?? 'each',
    unitLabel: item.unit_label ?? null,
    unitStep: Number(item.unit_step ?? 1),
    unitMin: item.unit_min == null ? null : Number(item.unit_min),
    unitMax: item.unit_max == null ? null : Number(item.unit_max),
    priceIsEstimate: Boolean(item.price_is_estimate),
  });
  const measured = unit.soldBy === 'weight' || unit.soldBy === 'volume';
  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  return (
    <li className="py-2">
      <details>
        <summary className="cursor-pointer text-[0.8125rem] font-bold">
          {item.name}
          <span className="text-muted ml-2 text-[0.6875rem] font-semibold">
            {measured
              ? `KES ${item.price_kes} per ${unit.unitLabel ?? 'unit'}`
              : `KES ${item.price_kes}`}
            {item.group_ids.length > 0 && ` · ${item.group_ids.length} choice group(s)`}
          </span>
        </summary>
        <div className="mt-2 space-y-3 pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={`How ${item.name} is sold`}
              className={input}
              value={unit.soldBy}
              onChange={(e) =>
                setUnit({ ...unit, soldBy: e.target.value as ItemUnitInput['soldBy'] })
              }
            >
              <option value="each">Each</option>
              <option value="pack">Pack</option>
              <option value="weight">By weight</option>
              <option value="volume">By volume</option>
            </select>
            {(measured || unit.soldBy === 'pack') && (
              <input
                aria-label="Unit"
                placeholder={measured ? 'kg' : '6 pack'}
                className={`${input} w-24`}
                value={unit.unitLabel ?? ''}
                onChange={(e) => setUnit({ ...unit, unitLabel: e.target.value })}
              />
            )}
            {measured && (
              <>
                <label className="text-[0.75rem] font-bold">
                  Step{' '}
                  <input
                    aria-label="Step"
                    inputMode="decimal"
                    className={`${input} w-16 text-right`}
                    value={String(unit.unitStep)}
                    onChange={(e) => setUnit({ ...unit, unitStep: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="text-[0.75rem] font-bold">
                  Least{' '}
                  <input
                    aria-label="Least a customer can buy"
                    inputMode="decimal"
                    className={`${input} w-16 text-right`}
                    value={unit.unitMin == null ? '' : String(unit.unitMin)}
                    onChange={(e) => setUnit({ ...unit, unitMin: num(e.target.value) })}
                  />
                </label>
                <label className="text-[0.75rem] font-bold">
                  Most{' '}
                  <input
                    aria-label="Most a customer can buy"
                    inputMode="decimal"
                    className={`${input} w-16 text-right`}
                    value={unit.unitMax == null ? '' : String(unit.unitMax)}
                    onChange={(e) => setUnit({ ...unit, unitMax: num(e.target.value) })}
                  />
                </label>
                <label className="flex items-center gap-1 text-[0.75rem] font-bold">
                  <input
                    type="checkbox"
                    checked={unit.priceIsEstimate}
                    onChange={(e) => setUnit({ ...unit, priceIsEstimate: e.target.checked })}
                  />
                  Final price after weighing
                </label>
              </>
            )}
            <button
              type="button"
              className={button}
              disabled={busy === `u${item.id}`}
              onClick={() => void run(`u${item.id}`, () => setItemUnit(item.id, unit))}
            >
              {busy === `u${item.id}` ? '…' : 'Save unit'}
            </button>
          </div>
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-1 text-[0.75rem] font-bold">
                  <input
                    type="checkbox"
                    checked={picked.includes(g.id)}
                    onChange={(e) =>
                      setPicked((p) =>
                        e.target.checked ? [...p, g.id] : p.filter((x) => x !== g.id),
                      )
                    }
                  />
                  {g.name}
                </label>
              ))}
              <button
                type="button"
                className={button}
                disabled={busy === `g${item.id}`}
                onClick={() => void run(`g${item.id}`, () => setItemOptionGroups(item.id, picked))}
              >
                {busy === `g${item.id}` ? '…' : 'Save choices'}
              </button>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
