import { DocumentLinks } from '@/components/finance/document-links';

/** "2026-11" for the month `back` months before the given Nairobi day. */
function monthBefore(today: string, back: number): string {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * The branded monthly financial report (NEXG-FR-…) for this month and the
 * five before it: Print opens the PDF, PDF saves it.
 */
export function MonthlyReportLinks({ today, count = 6 }: { today: string; count?: number }) {
  const months = Array.from({ length: count }, (_, i) => monthBefore(today, i));
  return (
    <div className="border-border rounded-xl border bg-white p-4">
      <p className="text-[0.875rem] font-extrabold">Monthly Financial Report</p>
      <p className="text-muted mt-0.5 text-[0.75rem]">
        The branded PDF for management: transaction value, NexG revenue by source, office expenses
        and operating profit.
      </p>
      <ul className="divide-border mt-3 divide-y">
        {months.map((month, i) => (
          <li key={month} className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-[0.8125rem] font-semibold">
              {monthLabel(month)}
              {i === 0 ? (
                <span className="text-muted-light ml-1.5 text-[0.6875rem]">so far</span>
              ) : null}
            </span>
            <DocumentLinks
              href={`/finance/documents/report/${month}`}
              label={`financial report for ${monthLabel(month)}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
