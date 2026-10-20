'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  addMenuItem,
  removeMenuItem,
  setItemAvailable,
  setItemPrice,
  type Outcome,
} from '@/app/merchant/actions';

import { Panel, Pill } from './bits';

export interface ItemRow {
  id: string;
  name: string;
  description: string | null;
  price_kes: number;
  available: boolean;
  age_restricted: boolean;
  sort: number;
}

export interface SectionRow {
  id: string;
  name: string;
}

const input =
  'border-border bg-surface focus:border-gold rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold outline-none';

/**
 * The menu: on and off, prices, and new items.
 *
 * Availability is instant with no confirmation, because a kitchen that has
 * run out needs it off now. Prices save on their own button and go live for
 * the next order, since checkout reads the price from the same row.
 */
export function Menu({
  items,
  available,
  merchantId,
  sections,
}: {
  items: ItemRow[];
  available: number;
  merchantId: string;
  sections: SectionRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const [edits, setEdits] = React.useState<Record<string, string>>({});

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
    <>
      <Panel title="Your menu" note={`${available} of ${items.length} orderable`}>
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

        <ul className="divide-border divide-y">
          {items.map((i) => {
            const draft = edits[i.id];
            const dirty = draft !== undefined && Number(draft) !== i.price_kes;
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p
                    className={`truncate text-[0.875rem] font-extrabold ${i.available ? '' : 'opacity-50'}`}
                  >
                    {i.name}
                    {i.age_restricted && (
                      <Pill tone="bg-danger-bg text-danger">
                        <span className="ml-1">18+</span>
                      </Pill>
                    )}
                  </p>
                  {i.description && (
                    <p className="text-muted truncate text-[0.75rem] font-semibold">
                      {i.description}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-light text-[0.6875rem] font-bold">KES</span>
                  <input
                    aria-label={`Price of ${i.name}`}
                    inputMode="numeric"
                    className={`${input} w-24 text-right tabular-nums`}
                    value={draft ?? String(i.price_kes ?? '')}
                    onChange={(e) =>
                      setEdits((p) => ({ ...p, [i.id]: e.target.value.replace(/\D/g, '') }))
                    }
                  />
                  {dirty && (
                    <button
                      type="button"
                      disabled={busy === `p${i.id}`}
                      onClick={async () => {
                        const r = await run(`p${i.id}`, () => setItemPrice(i.id, Number(draft)));
                        if (r.ok)
                          setEdits((p) => {
                            const rest = { ...p };
                            delete rest[i.id];
                            return rest;
                          });
                      }}
                      className="bg-gold text-ink rounded-lg px-3 py-2 text-[0.6875rem] font-extrabold disabled:opacity-40"
                    >
                      {busy === `p${i.id}` ? '…' : 'Save'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy === i.id}
                    onClick={() => void run(i.id, () => setItemAvailable(i.id, !i.available))}
                    aria-pressed={i.available}
                    className={`w-16 rounded-lg px-3 py-2 text-[0.6875rem] font-extrabold transition-colors disabled:opacity-40 ${
                      i.available
                        ? 'bg-success-bg text-success'
                        : 'border-border-strong text-muted border'
                    }`}
                  >
                    {busy === i.id ? '…' : i.available ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${i.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete ${i.name} from your menu?`))
                        void run(`d${i.id}`, () => removeMenuItem(i.id));
                    }}
                    className="text-muted hover:text-danger px-1 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <AddItem merchantId={merchantId} sections={sections} run={run} busy={busy === 'add'} />
    </>
  );
}

function AddItem({
  merchantId,
  sections,
  run,
  busy,
}: {
  merchantId: string;
  sections: SectionRow[];
  run: (key: string, action: () => Promise<Outcome>) => Promise<Outcome>;
  busy: boolean;
}) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [sectionId, setSectionId] = React.useState(sections[0]?.id ?? '');
  const [newSection, setNewSection] = React.useState('');
  const [age, setAge] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run('add', () =>
      addMenuItem({
        merchantId,
        sectionId: sectionId || null,
        newSection,
        name,
        description,
        priceKes: Number(price),
        ageRestricted: age,
      }),
    );
    if (r.ok) {
      setName('');
      setDescription('');
      setPrice('');
      setNewSection('');
      setAge(false);
    }
  };

  return (
    <Panel title="Add an item">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <input
          className={input}
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className={input}
          placeholder="Price in KES"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
          required
        />
        <input
          className={`${input} sm:col-span-2`}
          placeholder="Short description (optional)"
          maxLength={400}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {sections.length > 0 && (
          <select
            className={input}
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            aria-label="Section"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="">New section…</option>
          </select>
        )}
        {(sections.length === 0 || sectionId === '') && (
          <input
            className={input}
            placeholder="Section name, e.g. Mains"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
          />
        )}
        <label className="flex items-center gap-2 text-[0.8125rem] font-semibold">
          <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
          18+ (rider checks ID)
        </label>
        <button
          disabled={busy}
          className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
        >
          {busy ? 'Adding…' : 'Add to menu'}
        </button>
      </form>
    </Panel>
  );
}
