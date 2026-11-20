'use client';

import { Check, Download, FileDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  importOfferingsCsv,
  listImportBatches,
  previewOfferingsCsv,
  undoImportBatch,
  type ImportBatch,
  type OfferingsCsvPreview,
} from '@/app/merchant/offerings-csv-actions';

import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  type ColumnMapping,
  type ImportField,
  type RowFixes,
} from './any-csv';
import {
  OFFERINGS_CSV_MAX_BYTES,
  OFFERINGS_CSV_MAX_ROWS,
  offeringsExportCsv,
  offeringsTemplateCsv,
} from './csv';
import { download, Modal } from './dialog';
import { Label } from './editor';
import type { Offering, OfferingProfile } from './model';
import { schemas } from './schemas';

type Preview = Extract<OfferingsCsvPreview, { ok: true }>;

const RESULT: Record<Preview['rows'][number]['action'], string> = {
  create: 'New draft',
  update: 'Update',
  unchanged: 'No change',
};

/**
 * Import offerings from any spreadsheet saved as CSV: the merchant's own POS
 * export or price list as well as NexG's template. The server reads the file,
 * suggests which column is which (or remembers the last mapping for the same
 * columns), cleans the values and shows what would change; the import saves
 * the rows that are ready and keeps the rest under "needs attention".
 */
export function OfferingsCsvImport({
  open,
  onClose,
  profile,
  offerings,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  /** The business activity new offerings join. */
  profile: OfferingProfile;
  /** This activity's offerings, for the export. */
  offerings: Offering[];
  onImported: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [priceConfirmed, setPriceConfirmed] = useState(false);
  const [fixes, setFixes] = useState<RowFixes>({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState<'checking' | 'importing' | null>(null);
  const [done, setDone] = useState('');
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const schema = schemas[profile.schema];

  useEffect(() => {
    if (open) void listImportBatches().then(setBatches);
  }, [open]);

  function reset() {
    setFile(null);
    setPreview(null);
    setMapping(null);
    setPriceConfirmed(false);
    setFixes({});
    setProblem('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function check(next: {
    text: string;
    name: string;
    mapping?: ColumnMapping;
    fixes?: RowFixes;
  }) {
    setBusy('checking');
    setProblem('');
    const result = await previewOfferingsCsv({
      csv: next.text,
      fileName: next.name,
      profileId: profile.id,
      ...(next.mapping ? { mapping: next.mapping } : {}),
      ...(next.fixes ? { fixes: next.fixes } : {}),
    });
    setBusy(null);
    if (result.ok) {
      setPreview(result);
      setMapping(result.mapping);
    } else setProblem(result.message);
  }

  async function choose(picked: File | undefined) {
    setDone('');
    reset();
    if (!picked) return;
    if (picked.size > OFFERINGS_CSV_MAX_BYTES) {
      setProblem(
        `${picked.name} is larger than ${OFFERINGS_CSV_MAX_BYTES / 1024} KB. Split it into smaller files.`,
      );
      return;
    }
    if (/\.(xlsx|xls|numbers|ods)$/i.test(picked.name)) {
      setProblem(
        'Save the sheet as CSV first: in Excel or Google Sheets, File › Save as (or Download) › CSV. Then choose that file.',
      );
      return;
    }
    let text: string;
    try {
      text = await picked.text();
    } catch {
      setProblem('The file could not be read. Choose it again.');
      return;
    }
    setFile({ name: picked.name, text });
    await check({ text, name: picked.name });
  }

  function remap(field: ImportField, value: string) {
    if (!mapping || !file) return;
    const index = value === '' ? null : Number(value);
    const next = { ...mapping };
    // One column fills one field.
    for (const f of IMPORT_FIELDS) if (index !== null && next[f] === index) next[f] = null;
    next[field] = index;
    setMapping(next);
    if (field === 'price') setPriceConfirmed(false);
    void check({ text: file.text, name: file.name, mapping: next, fixes });
  }

  async function confirm() {
    if (!file || !preview || !mapping || busy) return;
    setBusy('importing');
    setProblem('');
    const result = await importOfferingsCsv({
      csv: file.text,
      fileName: file.name,
      profileId: profile.id,
      mapping,
      fixes,
    });
    setBusy(null);
    if (result.ok) {
      reset();
      setDone(result.message);
      onImported(result.message);
      void listImportBatches().then(setBatches);
      return;
    }
    setProblem(result.message);
    if (result.errors) setPreview({ ...preview, errors: result.errors });
  }

  async function undo(batch: ImportBatch) {
    setBusy('importing');
    const result = await undoImportBatch(batch.id);
    setBusy(null);
    if (result.ok) {
      setDone(result.message);
      onImported(result.message);
    } else setProblem(result.message);
    void listImportBatches().then(setBatches);
  }

  const errors = preview?.errors ?? [];
  const attention = preview?.attention ?? [];
  const changes = (preview?.creates ?? 0) + (preview?.updates ?? 0);
  const needsPrice = mapping?.price !== null && mapping?.price !== undefined;
  const ready = !!preview && errors.length === 0 && changes > 0 && (!needsPrice || priceConfirmed);

  return (
    <Modal
      open={open}
      wide
      title="Import offerings"
      description={`Add or update many ${schema?.plural.toLowerCase() ?? 'offerings'} for ${profile.name} from any spreadsheet: your till or POS export, a price list, or NexG's template. You see what will change before anything is saved.`}
      onClose={() => {
        if (busy === 'importing') return;
        reset();
        setDone('');
        onClose();
      }}
      footer={
        done && !preview ? (
          <button
            type="button"
            className="of-button of-primary"
            onClick={() => {
              setDone('');
              onClose();
            }}
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              className="of-button"
              disabled={busy === 'importing'}
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="of-button of-primary"
              disabled={!ready || busy !== null}
              onClick={() => void confirm()}
            >
              {busy === 'importing'
                ? 'Importing…'
                : errors.length
                  ? 'Fix the file to import'
                  : preview && needsPrice && !priceConfirmed
                    ? 'Confirm the price column'
                    : preview && changes === 0
                      ? 'Nothing to import'
                      : `Import ${changes || ''} offering${changes === 1 ? '' : 's'}`}
            </button>
          </>
        )
      }
    >
      <div className="of-fields">
        <div className="of-note of-csv-help">
          <div>
            <p>
              Any CSV works: NexG matches its columns to name, price, category, description,
              available, SKU and stock, and you confirm the matches. Columns NexG has no field for
              are kept with each item as extra details. Excel or Google Sheets: save as CSV first.
            </p>
            <p>
              A row updates the offering with the same name in the same category, so importing again
              never adds copies. Rows that cannot be used are listed under{' '}
              <strong>needs attention</strong>; the rest still import.
            </p>
          </div>
        </div>
        <div className="of-csv-actions">
          <button
            type="button"
            className="of-button"
            onClick={() => download('nexg-offerings-template.csv', offeringsTemplateCsv(profile))}
          >
            <FileDown size={15} />
            Download template
          </button>
          <button
            type="button"
            className="of-button"
            disabled={!offerings.length}
            onClick={() =>
              download(
                `nexg-offerings-${new Date().toISOString().slice(0, 10)}.csv`,
                offeringsExportCsv(offerings),
              )
            }
          >
            <Download size={15} />
            Export offerings
          </button>
        </div>
        <Label
          title="Spreadsheet (CSV)"
          hint={`Up to ${OFFERINGS_CSV_MAX_ROWS} offerings · ${OFFERINGS_CSV_MAX_BYTES / 1024} KB`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            disabled={busy !== null}
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </Label>

        <div aria-live="polite">
          {done && (
            <p className="of-note" role="status">
              <Check size={15} />
              {done}
            </p>
          )}
          {busy === 'checking' && <p className="of-muted">Checking {file?.name}…</p>}
          {problem && (
            <p className="of-error" role="alert">
              {problem}
            </p>
          )}
        </div>

        {preview && file && mapping && (
          <div className="of-csv-preview">
            <h3>Match your columns</h3>
            <p className="of-muted">
              {preview.remembered
                ? 'Matched the way you confirmed last time for these columns.'
                : 'Matched from the column names. Check each one.'}{' '}
              Column names are on row {preview.headerRow}.
            </p>
            <div className="of-table-scroll">
              <table className="of-table" aria-label="Match your columns">
                <thead>
                  <tr>
                    <th>NexG field</th>
                    <th>Your column</th>
                    <th>First values</th>
                  </tr>
                </thead>
                <tbody>
                  {IMPORT_FIELDS.map((field) => (
                    <tr key={field}>
                      <td>
                        <strong>{IMPORT_FIELD_LABELS[field]}</strong>
                        {field === 'name' ? <small>Required</small> : null}
                      </td>
                      <td>
                        <select
                          aria-label={`Column for ${IMPORT_FIELD_LABELS[field]}`}
                          value={mapping[field] ?? ''}
                          disabled={busy !== null}
                          onChange={(event) => remap(field, event.target.value)}
                        >
                          <option value="">Not in my file</option>
                          {preview.headers.map((header, index) => (
                            <option key={index} value={index}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <small>
                          {mapping[field] === null
                            ? '—'
                            : preview.sample
                                .map((row) => row[mapping[field]!] ?? '')
                                .filter(Boolean)
                                .slice(0, 3)
                                .join(' · ') || '—'}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {needsPrice && (
              <label className="of-check">
                <input
                  type="checkbox"
                  checked={priceConfirmed}
                  onChange={(event) => setPriceConfirmed(event.target.checked)}
                />{' '}
                <span>
                  <strong>{preview.headers[mapping.price!]}</strong> is the selling price in Kenyan
                  shillings, the price guests pay.
                </span>
              </label>
            )}
            {preview.extraColumns.length > 0 && (
              <p className="of-muted">
                Kept as extra details on each item: {preview.extraColumns.join(', ')}.
              </p>
            )}

            <p>
              <strong>{file.name}</strong>: {preview.creates} new · {preview.updates} updated ·{' '}
              {preview.unchanged} unchanged · {attention.length} need attention
              {preview.merged ? ` · ${preview.merged} duplicate rows merged` : ''}
            </p>
            {errors.length > 0 && (
              <ul className="of-error" aria-label="Problems with the file">
                {errors.map((error, index) => (
                  <li key={index}>{error.message}</li>
                ))}
              </ul>
            )}
            {preview.rows.length > 0 && (
              <div className="of-table-scroll">
                <table className="of-table" aria-label="Import preview">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Offering</th>
                      <th>Price</th>
                      <th>Result</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.row}>
                        <td>{row.sourceRows.join(', ')}</td>
                        <td>
                          <strong>{row.name}</strong>
                          <small>{row.category}</small>
                        </td>
                        <td>
                          {row.price
                            ? `KES ${Number(row.price).toLocaleString('en-KE')}`
                            : row.priceMode === 'enquiry'
                              ? 'By enquiry'
                              : 'By quote'}
                        </td>
                        <td>
                          {RESULT[row.action]}
                          <small>{row.published ? 'Published' : 'Draft'}</small>
                        </td>
                        <td className={row.priceAlert ? 'of-error' : undefined}>
                          {row.notes.join(' ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {attention.length > 0 && (
              <>
                <h3>Needs attention</h3>
                <p className="of-muted">
                  These rows are not imported yet. Correct them here and press Check again, or
                  import the rest now and fix these later from the next import.
                </p>
                <div className="of-table-scroll">
                  <table className="of-table" aria-label="Rows that need attention">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Problem</th>
                        <th>Name</th>
                        <th>Price</th>
                        <th>Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attention.slice(0, 100).map((row) => {
                        const fix = fixes[row.sourceRow] ?? {};
                        const cell = (field: 'name' | 'price' | 'category') =>
                          fix[field] ??
                          (mapping[field] === null
                            ? ''
                            : (row.raw[preview.headers[mapping[field]!] ?? ''] ?? ''));
                        const edit = (field: 'name' | 'price' | 'category', value: string) =>
                          setFixes({ ...fixes, [row.sourceRow]: { ...fix, [field]: value } });
                        return (
                          <tr key={`${row.sourceRow}-${row.message}`}>
                            <td>{row.sourceRow}</td>
                            <td>{row.message}</td>
                            {(['name', 'price', 'category'] as const).map((field) => (
                              <td key={field}>
                                <input
                                  aria-label={`${field} for row ${row.sourceRow}`}
                                  value={cell(field)}
                                  onChange={(event) => edit(field, event.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {attention.length > 100 && <p>…and {attention.length - 100} more.</p>}
                <button
                  type="button"
                  className="of-button"
                  disabled={busy !== null || Object.keys(fixes).length === 0}
                  onClick={() => void check({ text: file.text, name: file.name, mapping, fixes })}
                >
                  Check again
                </button>
              </>
            )}
          </div>
        )}

        {batches.length > 0 && !preview && (
          <div className="of-csv-preview">
            <h3>Recent imports</h3>
            <ul>
              {batches.map((batch) => (
                <li key={batch.id}>
                  <strong>{batch.file_name}</strong>,{' '}
                  {new Date(batch.created_at).toLocaleString('en-KE')}: {batch.created} added,{' '}
                  {batch.updated} updated
                  {batch.attention ? `, ${batch.attention} needed attention` : ''}
                  {batch.undone_at
                    ? ` · undone (${batch.undone_removed ?? 0} removed)`
                    : batch.can_undo
                      ? ' · '
                      : ''}
                  {!batch.undone_at && batch.can_undo ? (
                    <button
                      type="button"
                      className="of-button"
                      disabled={busy !== null}
                      onClick={() => void undo(batch)}
                    >
                      Undo this import
                    </button>
                  ) : null}
                  {batch.attention_rows.length > 0 ? (
                    <details>
                      <summary>Rows that needed attention</summary>
                      <ul>
                        {batch.attention_rows.slice(0, 50).map((row) => (
                          <li key={row.row}>
                            Row {row.row}: {row.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
