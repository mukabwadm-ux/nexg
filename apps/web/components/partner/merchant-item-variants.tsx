'use client';

import * as React from 'react';

import type { Outcome } from '@/app/merchant/actions';
import { saveItemVariants, type VariantGridInput } from '@/app/merchant/menu/choices-actions';

/*
 * Versions of one item with their own price and stock: for example sizes down
 * and colours across, a price and "in stock" in every cell. A cell left
 * without a price is not sold. Saved with rpc_merchant_item_variants_save.
 */

export type ItemVariants = VariantGridInput;

interface Cell {
  price: string;
  available: boolean;
  stock: string;
}

const input =
  'border-border bg-surface focus:border-gold rounded-lg border px-2 py-1.5 text-[0.75rem] font-semibold outline-none';
const button =
  'bg-gold text-ink rounded-lg px-3 py-2 text-[0.6875rem] font-extrabold disabled:opacity-40';
const quiet =
  'border-border-strong text-muted rounded-lg border px-3 py-2 text-[0.6875rem] font-extrabold disabled:opacity-40';

const split = (text: string) =>
  [
    ...new Set(
      text
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].slice(0, 40);
const key = (values: string[]) => JSON.stringify(values);

export function VariantGrid({
  itemName,
  itemId,
  saved,
  basePriceKes,
  busy,
  run,
}: {
  itemName: string;
  itemId: string;
  saved: ItemVariants;
  basePriceKes: number;
  busy: boolean;
  run: (key: string, action: () => Promise<Outcome>) => Promise<Outcome>;
}) {
  const [rowName, setRowName] = React.useState(saved.attributes[0]?.name ?? 'Size');
  const [rowValues, setRowValues] = React.useState(saved.attributes[0]?.values.join(', ') ?? '');
  const [colName, setColName] = React.useState(saved.attributes[1]?.name ?? '');
  const [colValues, setColValues] = React.useState(saved.attributes[1]?.values.join(', ') ?? '');
  const [cells, setCells] = React.useState<Record<string, Cell>>(() =>
    Object.fromEntries(
      saved.variants.map((v) => [
        key(v.values),
        {
          price: String(v.priceKes),
          available: v.available,
          stock: v.stockCount == null ? '' : String(v.stockCount),
        },
      ]),
    ),
  );
  const [fill, setFill] = React.useState(String(basePriceKes || ''));

  const rows = split(rowValues);
  const cols = colName.trim() ? split(colValues) : [];
  const combos = cols.length ? rows.flatMap((r) => cols.map((c) => [r, c])) : rows.map((r) => [r]);
  const cell = (values: string[]): Cell =>
    cells[key(values)] ?? { price: '', available: true, stock: '' };
  const setCell = (values: string[], patch: Partial<Cell>) =>
    setCells((all) => ({ ...all, [key(values)]: { ...cell(values), ...patch } }));
  const fillAll = (only?: string) =>
    setCells((all) => {
      const next = { ...all };
      for (const values of combos)
        if (only === undefined || values[0] === only)
          next[key(values)] = { ...cell(values), price: fill };
      return next;
    });

  const save = () => {
    const attributes = [
      { name: rowName.trim(), values: rows },
      ...(cols.length ? [{ name: colName.trim(), values: cols }] : []),
    ].filter((a) => a.name && a.values.length);
    const variants = combos
      .filter((values) => cell(values).price.trim() !== '')
      .map((values) => ({
        values,
        priceKes: Number(cell(values).price),
        available: cell(values).available,
        stockCount: cell(values).stock.trim() === '' ? null : Number(cell(values).stock),
      }));
    return run(`v${itemId}`, () => saveItemVariants(itemId, { attributes, variants }));
  };

  // Called as a function, not a component, so typing keeps focus.
  const box = (values: string[]) => {
    const c = cell(values);
    return (
      <div key={key(values)} className="flex flex-col gap-1">
        <input
          aria-label={`Price of ${itemName} ${values.join(' / ')}`}
          inputMode="numeric"
          placeholder="KES"
          className={`${input} w-20 text-right`}
          value={c.price}
          onChange={(e) => setCell(values, { price: e.target.value.replace(/[^0-9]/g, '') })}
        />
        <label className="flex items-center gap-1 text-[0.6875rem] font-bold">
          <input
            type="checkbox"
            checked={c.available}
            onChange={(e) => setCell(values, { available: e.target.checked })}
          />
          In stock
        </label>
        <input
          aria-label={`How many ${itemName} ${values.join(' / ')} are left`}
          inputMode="numeric"
          placeholder="Count"
          className={`${input} w-20 text-right`}
          value={c.stock}
          onChange={(e) => setCell(values, { stock: e.target.value.replace(/[^0-9]/g, '') })}
        />
      </div>
    );
  };

  return (
    <div className="border-border space-y-2 rounded-lg border p-3">
      <p className="text-[0.75rem] font-extrabold">
        Versions with their own price and stock
        <span className="text-muted ml-2 font-semibold">
          For example sizes and colours. Leave a price empty if you don&apos;t sell that version;
          leave the count empty if you don&apos;t count stock.
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="First thing that varies"
          className={`${input} w-24`}
          value={rowName}
          onChange={(e) => setRowName(e.target.value)}
        />
        <input
          aria-label={`${rowName || 'First'} values, separated by commas`}
          placeholder="S, M, L"
          className={`${input} w-48`}
          value={rowValues}
          onChange={(e) => setRowValues(e.target.value)}
        />
        <input
          aria-label="Second thing that varies (optional)"
          placeholder="Colour (optional)"
          className={`${input} w-32`}
          value={colName}
          onChange={(e) => setColName(e.target.value)}
        />
        {colName.trim() && (
          <input
            aria-label={`${colName} values, separated by commas`}
            placeholder="Black, White"
            className={`${input} w-48`}
            value={colValues}
            onChange={(e) => setColValues(e.target.value)}
          />
        )}
      </div>
      {combos.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Price to fill"
              inputMode="numeric"
              className={`${input} w-20 text-right`}
              value={fill}
              onChange={(e) => setFill(e.target.value.replace(/[^0-9]/g, ''))}
            />
            <button type="button" className={quiet} onClick={() => fillAll()}>
              Fill every price
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="text-[0.75rem]">
              <thead>
                <tr>
                  <th className="pr-2 text-left">{rowName}</th>
                  {cols.length ? (
                    cols.map((c) => (
                      <th key={c} className="px-2 text-left">
                        {c}
                      </th>
                    ))
                  ) : (
                    <th className="px-2 text-left">Price</th>
                  )}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r} className="align-top">
                    <th className="py-1 pr-2 text-left font-bold">{r}</th>
                    {cols.length ? (
                      cols.map((c) => (
                        <td key={c} className="px-2 py-1">
                          {box([r, c])}
                        </td>
                      ))
                    ) : (
                      <td className="px-2 py-1">{box([r])}</td>
                    )}
                    <td className="py-1">
                      {cols.length > 0 && (
                        <button type="button" className={quiet} onClick={() => fillAll(r)}>
                          Fill row
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="flex gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => void save()}>
          {busy ? '…' : 'Save versions'}
        </button>
        {saved.attributes.length > 0 && (
          <button
            type="button"
            className={quiet}
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Stop selling ${itemName} in versions?`))
                void run(`v${itemId}`, () =>
                  saveItemVariants(itemId, { attributes: [], variants: [] }),
                );
            }}
          >
            Turn versions off
          </button>
        )}
      </div>
    </div>
  );
}
