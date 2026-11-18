'use client';

import { ExportButton } from '@/components/portal/client-kit';
import type { CsvRows } from '@/lib/finance-reports';

/**
 * A report table's Export. The rows are built on the server, header first,
 * and handed over as plain data; the CSV file is made here, in the browser.
 */
export function ReportExport({ filename, rows }: { filename: string; rows: CsvRows }) {
  return <ExportButton filename={filename} rows={() => rows} />;
}
