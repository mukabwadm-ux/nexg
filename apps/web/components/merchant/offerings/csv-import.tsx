'use client';

import { Check, Download, FileDown } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  importOfferingsCsv,
  previewOfferingsCsv,
  type OfferingsCsvPreview,
} from '@/app/merchant/offerings-csv-actions';

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
 * Import offerings from a CSV file: template, export, a preview the server
 * works out from the file, and the import, which the server plans again
 * before saving anything.
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
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState<'checking' | 'importing' | null>(null);
  /** What the last import did, shown until the dialog closes or a new file is chosen. */
  const [done, setDone] = useState('');
  const schema = schemas[profile.schema];

  function reset() {
    setFile(null);
    setPreview(null);
    setProblem('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function choose(picked: File | undefined) {
    setDone('');
    setProblem('');
    setPreview(null);
    if (!picked) return reset();
    if (picked.size > OFFERINGS_CSV_MAX_BYTES) {
      reset();
      setProblem(
        `${picked.name} is larger than ${OFFERINGS_CSV_MAX_BYTES / 1024} KB. Split it into smaller files.`,
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
    setBusy('checking');
    const result = await previewOfferingsCsv({ csv: text, profileId: profile.id });
    setBusy(null);
    if (result.ok) setPreview(result);
    else setProblem(result.message);
  }

  async function confirm() {
    if (!file || !preview || busy) return;
    setBusy('importing');
    setProblem('');
    const result = await importOfferingsCsv({ csv: file.text, profileId: profile.id });
    setBusy(null);
    if (result.ok) {
      reset();
      setDone(result.message);
      onImported(result.message);
      return;
    }
    setProblem(result.message);
    if (result.errors) setPreview({ ...preview, errors: result.errors });
  }

  const errors = preview?.errors ?? [];
  const changes = (preview?.creates ?? 0) + (preview?.updates ?? 0);

  return (
    <Modal
      open={open}
      wide
      title="Import offerings"
      description={`Add or update many ${schema?.plural.toLowerCase() ?? 'offerings'} for ${profile.name} from a spreadsheet. You see what will change before anything is saved.`}
      onClose={() => {
        if (busy === 'importing') return;
        reset();
        setDone('');
        onClose();
      }}
      footer={
        done ? (
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
              disabled={!preview || errors.length > 0 || changes === 0 || busy !== null}
              onClick={() => void confirm()}
            >
              {busy === 'importing'
                ? 'Importing…'
                : errors.length
                  ? 'Fix the errors to import'
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
              One row per offering, with the columns <strong>category</strong>,{' '}
              <strong>name</strong>, <strong>description</strong>, <strong>price_kes</strong> and{' '}
              <strong>available</strong>. Categories become the sections guests see in your store.
            </p>
            <p>
              A row updates the offering with the same name in the same category, so importing a
              file again never adds copies. Other rows are added as drafts. Available{' '}
              <strong>yes</strong> publishes an offering once it is complete; <strong>no</strong>{' '}
              unpublishes it. Photos are added in the editor.
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
          title="CSV file"
          hint={`Up to ${OFFERINGS_CSV_MAX_ROWS} offerings · ${OFFERINGS_CSV_MAX_BYTES / 1024} KB`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            disabled={busy !== null}
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </Label>

        <div aria-live="polite">
          {done && (
            <p className="of-note" role="status">
              <Check size={15} />
              {done} Imported offerings are in your list; open one to add photos or publish it.
            </p>
          )}
          {busy === 'checking' && <p className="of-muted">Checking {file?.name}…</p>}
          {problem && (
            <p className="of-error" role="alert">
              {problem}
            </p>
          )}
          {preview && file && (
            <div className="of-csv-preview">
              <p>
                <strong>{file.name}</strong>: {preview.creates} new · {preview.updates} updated ·{' '}
                {preview.unchanged} unchanged · {errors.length} error
                {errors.length === 1 ? '' : 's'}
              </p>
              {errors.length > 0 && (
                <ul className="of-error" aria-label="Rows to fix">
                  {errors.slice(0, 100).map((error, index) => (
                    <li key={index}>
                      {error.row === 1 ? 'File' : `Row ${error.row}`}: {error.message}
                    </li>
                  ))}
                  {errors.length > 100 && <li>…and {errors.length - 100} more.</li>}
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
                          <td>{row.row}</td>
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
                          <td>{row.notes.join(' ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
