'use client';

import { Download, FileDown, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  importCatalogueCsv,
  type CatalogueImportResult,
} from '@/app/merchant/catalogue-csv-actions';
import {
  CATALOGUE_CSV_MAX_BYTES,
  CATALOGUE_CSV_MAX_ROWS,
  catalogueExportCsv,
  catalogueTemplateCsv,
  type CatalogueCsvItem,
  type ImportPlan,
} from '@/lib/catalogue-csv';
import {
  CATALOGUE_FILE_ACCEPT,
  CATALOGUE_FORMATS,
  FORMAT_LABEL,
  FORMAT_MIME,
  detectFormat,
  fromCsvText,
  planCatalogueFile,
  type CatalogueFormat,
} from '@/lib/catalogue-formats';

import { Panel } from './bits';

const button =
  'border-border hover:border-ink inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold transition-colors disabled:opacity-40';

function download(filename: string, text: string, format: CatalogueFormat = 'csv') {
  const url = URL.createObjectURL(
    new Blob([text], { type: `${FORMAT_MIME[format]};charset=utf-8` }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Bulk edit the catalogue as a spreadsheet: download a template, export
 * what is there, and import a CSV back after a preview. The preview is
 * worked out here; the server re-checks it before anything is saved.
 */
export function CatalogueCsv({
  merchantId,
  items,
  sections,
  example,
}: {
  merchantId: string;
  items: CatalogueCsvItem[];
  sections: { id: string; name: string }[];
  example?: { name: string; description: string; pricePlaceholder?: string };
}) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<{
    name: string;
    text: string;
    format: CatalogueFormat;
  } | null>(null);
  const [downloadFormat, setDownloadFormat] = React.useState<CatalogueFormat>('csv');
  const [plan, setPlan] = React.useState<ImportPlan | null>(null);
  const [result, setResult] = React.useState<CatalogueImportResult | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = () => {
    setFile(null);
    setPlan(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const choose = async (picked: File | undefined) => {
    setResult(null);
    if (!picked) return reset();
    if (picked.size > CATALOGUE_CSV_MAX_BYTES) {
      reset();
      setResult({
        ok: false,
        message: `${picked.name} is larger than ${CATALOGUE_CSV_MAX_BYTES / 1024} KB. Split it into smaller files.`,
      });
      return;
    }
    const text = await picked.text();
    const format = detectFormat(picked.name, text);
    setFile({ name: picked.name, text, format });
    setPlan(planCatalogueFile(text, format, items));
  };

  const confirm = async () => {
    if (!file) return;
    setBusy(true);
    const r = await importCatalogueCsv({ merchantId, csv: file.text, format: file.format });
    setBusy(false);
    setResult(r);
    if (r.ok) {
      reset();
      router.refresh();
    } else if (r.errors) {
      setPlan({ ...(plan ?? { rows: [], creates: 0, updates: 0 }), errors: r.errors });
    } else if (r.created || r.updated) {
      router.refresh();
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const errors = plan?.errors ?? [];

  return (
    <Panel
      title="Import or export"
      note={`CSV, JSON or XML, up to ${CATALOGUE_CSV_MAX_ROWS} products per file`}
    >
      <p className="text-muted mb-3 text-[0.75rem] font-semibold">
        Edit many products at once in Excel or Google Sheets. Export, change prices or details, and
        import the same file back. Rows with an id update that product; rows without one are added.
        Photos stay as they are. JSON and XML use the same field names as the CSV columns; row 2 is
        the first item.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex items-center gap-1.5 text-[0.75rem] font-extrabold">
          Format
          <select
            className="border-border rounded-lg border bg-transparent px-2 py-2 text-[0.75rem] font-extrabold"
            value={downloadFormat}
            onChange={(e) => setDownloadFormat(e.target.value as CatalogueFormat)}
          >
            {CATALOGUE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={button}
          onClick={() =>
            download(
              `nexg-catalogue-template.${downloadFormat}`,
              fromCsvText(catalogueTemplateCsv(example), downloadFormat),
              downloadFormat,
            )
          }
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
          Download template
        </button>
        <button
          type="button"
          className={button}
          disabled={!items.length}
          onClick={() =>
            download(
              `nexg-catalogue-${today}.${downloadFormat}`,
              fromCsvText(
                catalogueExportCsv(items, new Map(sections.map((s) => [s.id, s.name]))),
                downloadFormat,
              ),
              downloadFormat,
            )
          }
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export catalogue
        </button>
        <label className={`${button} cursor-pointer`}>
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          Import file
          <input
            ref={fileRef}
            type="file"
            accept={CATALOGUE_FILE_ACCEPT}
            className="sr-only"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </label>
      </div>

      {result && (
        <p
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-[0.75rem] font-bold ${
            result.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {result.message}
        </p>
      )}

      {file && plan && (
        <div className="border-border mt-3 rounded-xl border p-3" aria-live="polite">
          <p className="text-[0.8125rem] font-extrabold">{file.name}</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] font-bold">
            <li>{plan.creates} new</li>
            <li>{plan.updates} updated</li>
            <li className={errors.length ? 'text-danger' : 'text-muted'}>
              {errors.length} error{errors.length === 1 ? '' : 's'}
            </li>
          </ul>

          {errors.length > 0 && (
            <ul className="bg-danger-bg text-danger mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-lg px-3 py-2 text-[0.75rem] font-semibold">
              {errors.slice(0, 100).map((e, i) => (
                <li key={i}>
                  {e.row === 1 ? 'File' : `Row ${e.row}`}: {e.message}
                </li>
              ))}
              {errors.length > 100 && <li>…and {errors.length - 100} more.</li>}
            </ul>
          )}

          {plan.rows.some((r) => r.matchedBy === 'name') && (
            <p className="text-muted mt-2 text-[0.6875rem] font-semibold">
              Rows without an id that share a name with one of your products update that product.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || errors.length > 0 || plan.rows.length === 0}
              onClick={() => void confirm()}
              className="bg-gold text-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold disabled:opacity-40"
            >
              {busy
                ? 'Importing…'
                : errors.length
                  ? 'Fix the errors to import'
                  : `Import ${plan.rows.length} product${plan.rows.length === 1 ? '' : 's'}`}
            </button>
            <button type="button" onClick={reset} disabled={busy} className={button}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
