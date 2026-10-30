'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { ImagePlus } from 'lucide-react';

import {
  addMenuItems,
  removeMenuItem,
  setItemAvailable,
  setItemPrice,
  type Outcome,
} from '@/app/merchant/actions';
import { uploadCatalogueImage } from '@/lib/catalogue-images';
import type { CatalogueExample } from '@nexg/contracts';

import { Panel, Pill } from './bits';

export interface ItemRow {
  id: string;
  name: string;
  description: string | null;
  price_kes: number;
  available: boolean;
  age_restricted: boolean;
  sort: number;
  photo_path?: string | null;
  photo_url?: string | null;
  portion_size?: string | null;
  ingredients?: string | null;
  allergens?: string[];
  dietary_labels?: string[];
  availability_notes?: string | null;
  handling_notes?: string | null;
  storage_guidance?: string | null;
  prep_time_minutes?: number | null;
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
  catalogueExample,
}: {
  items: ItemRow[];
  available: number;
  merchantId: string;
  sections: SectionRow[];
  catalogueExample?: CatalogueExample;
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
      <Panel title="Your catalogue" note={`${available} of ${items.length} available to guests`}>
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
                  {i.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={i.photo_url}
                      alt=""
                      className="mb-2 h-12 w-12 rounded-lg object-cover"
                    />
                  )}
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
                  {(i.portion_size ||
                    i.ingredients ||
                    i.allergens?.length ||
                    i.dietary_labels?.length ||
                    i.availability_notes ||
                    i.handling_notes ||
                    i.storage_guidance ||
                    i.prep_time_minutes) && (
                    <p className="text-muted-light mt-1 line-clamp-2 text-[0.6875rem] font-semibold">
                      {[
                        i.portion_size,
                        i.ingredients,
                        i.allergens?.length ? `Allergens: ${i.allergens.join(', ')}` : null,
                        i.dietary_labels?.length ? `Dietary: ${i.dietary_labels.join(', ')}` : null,
                        i.availability_notes,
                        i.handling_notes,
                        i.storage_guidance,
                        i.prep_time_minutes ? `Item prep: ${i.prep_time_minutes} min` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
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

      <AddItem
        merchantId={merchantId}
        sections={sections}
        run={run}
        busy={busy === 'add'}
        catalogueExample={catalogueExample}
      />
    </>
  );
}

function AddItem({
  merchantId,
  sections,
  run,
  busy,
  catalogueExample,
}: {
  merchantId: string;
  sections: SectionRow[];
  run: (key: string, action: () => Promise<Outcome>) => Promise<Outcome>;
  busy: boolean;
  catalogueExample?: CatalogueExample;
}) {
  const [items, setItems] = React.useState([
    {
      name: '',
      description: '',
      price: '',
      ageRestricted: false,
      photoPath: null as string | null,
      photoUrl: null as string | null,
    },
  ]);
  const [sectionId, setSectionId] = React.useState(sections[0]?.id ?? '');
  const [newSection, setNewSection] = React.useState('');
  const [uploadingImage, setUploadingImage] = React.useState<number | null>(null);
  const [imageError, setImageError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run('add', () =>
      addMenuItems({
        merchantId,
        sectionId: sectionId || null,
        newSection,
        items: items.map((item) => ({
          name: item.name,
          description: item.description,
          priceKes: Number(item.price),
          ageRestricted: item.ageRestricted,
          photoPath: item.photoPath,
        })),
      }),
    );
    if (r.ok) {
      setItems([
        {
          name: '',
          description: '',
          price: '',
          ageRestricted: false,
          photoPath: null,
          photoUrl: null,
        },
      ]);
      setNewSection('');
    }
  };

  return (
    <Panel title="Add products">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-muted text-[0.8125rem]">
          Add one or several items at once. The examples below are category-specific prompts; enter
          your actual details and price.
        </p>
        <div className="space-y-3">
          {items.map((item, index) => (
            <fieldset
              key={index}
              disabled={busy}
              className="border-border grid gap-3 rounded-xl border p-3 disabled:opacity-70 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-start"
            >
              <legend className="text-ink px-1 text-xs font-bold">Product {index + 1}</legend>
              <div className="grid gap-3">
                <input
                  className={input}
                  placeholder={catalogueExample?.name ?? 'Name guests will recognize'}
                  aria-label={`Product ${index + 1} name`}
                  value={item.name}
                  onChange={(e) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, name: e.target.value } : row,
                      ),
                    )
                  }
                  required
                />
                <input
                  className={input}
                  placeholder={catalogueExample?.description ?? 'Useful details guests should know'}
                  aria-label={`Product ${index + 1} description`}
                  maxLength={400}
                  value={item.description}
                  onChange={(e) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, description: e.target.value } : row,
                      ),
                    )
                  }
                />
              </div>
              <input
                className={input}
                placeholder={catalogueExample?.pricePlaceholder ?? 'e.g. 1,200'}
                aria-label={`Product ${index + 1} price in KES`}
                inputMode="numeric"
                value={item.price}
                onChange={(e) =>
                  setItems((current) =>
                    current.map((row, rowIndex) =>
                      rowIndex === index
                        ? { ...row, price: e.target.value.replace(/\D/g, '') }
                        : row,
                    ),
                  )
                }
                required
              />
              <div className="sm:col-span-3">
                <label
                  htmlFor={`catalogue-photo-${index}`}
                  className="border-border-strong text-ink hover:border-ink flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold"
                >
                  {uploadingImage === index ? (
                    'Uploading photo…'
                  ) : item.photoPath ? (
                    'Replace item photo'
                  ) : (
                    <>
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />
                      Add item photo
                    </>
                  )}
                  <input
                    id={`catalogue-photo-${index}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={busy || uploadingImage !== null}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';
                      if (!file) return;
                      setImageError(null);
                      setUploadingImage(index);
                      void uploadCatalogueImage(merchantId, file).then((result) => {
                        setUploadingImage(null);
                        if (!result.ok) {
                          setImageError(result.message);
                          return;
                        }
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, photoPath: result.path, photoUrl: result.url }
                              : row,
                          ),
                        );
                      });
                    }}
                  />
                </label>
                <p className="text-muted-light mt-1 text-[0.6875rem]">
                  {catalogueExample?.photoHint ?? 'Choose a clear item or service photo.'} JPEG,
                  PNG, or WebP up to 5 MB.
                </p>
                {item.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photoUrl}
                    alt={item.name || `Catalogue item ${index + 1}`}
                    className="mt-2 h-16 w-16 rounded-lg object-cover"
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                <label className="flex min-h-11 items-center gap-2 text-[0.8125rem] font-semibold">
                  <input
                    type="checkbox"
                    checked={item.ageRestricted}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, ageRestricted: e.target.checked } : row,
                        ),
                      )
                    }
                  />
                  Age restricted
                </label>
                {items.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove product ${index + 1}`}
                    onClick={() =>
                      setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))
                    }
                    className="text-danger min-h-11 px-2 text-xs font-bold"
                  >
                    Remove
                  </button>
                )}
              </div>
            </fieldset>
          ))}
        </div>
        {imageError && (
          <p role="alert" className="text-danger text-xs font-semibold">
            {imageError}
          </p>
        )}
        <button
          type="button"
          disabled={items.length >= 50 || busy}
          onClick={() =>
            setItems((current) => [
              ...current,
              {
                name: '',
                description: '',
                price: '',
                ageRestricted: false,
                photoPath: null,
                photoUrl: null,
              },
            ])
          }
          className="border-border-strong text-ink hover:border-ink min-h-11 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"
        >
          Add another product
        </button>
        <p className="text-muted-light text-xs">{items.length} of 50 products in this batch</p>
        {sections.length > 0 && (
          <select
            className={input}
            disabled={busy || uploadingImage !== null}
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
            disabled={busy}
            placeholder="Catalogue section, e.g. Drinks or Skincare"
            aria-label="New catalogue section name"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
          />
        )}
        <button
          disabled={busy}
          className="bg-ink min-h-11 rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-50"
        >
          {busy ? 'Adding…' : `Add ${items.length} item${items.length === 1 ? '' : 's'}`}
        </button>
      </form>
    </Panel>
  );
}
