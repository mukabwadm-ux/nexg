import { Download, Printer } from 'lucide-react';

/**
 * Print and Download for a branded finance document. Print opens the PDF
 * in a new tab, where the browser prints it; Download saves it.
 */
export function DocumentLinks({
  href,
  label,
  className = '',
}: {
  /** /finance/documents/<kind>/<id>, with any query it needs. */
  href: string;
  /** What the document is, for screen readers: "receipt", "statement"… */
  label: string;
  className?: string;
}) {
  const join = href.includes('?') ? '&' : '?';
  const base =
    'border-border text-ink hover:border-gold hover:text-gold-text inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[0.6875rem] font-bold transition-colors';
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className={base}
        aria-label={`Print ${label}`}
        title={`Open the ${label} to print`}
      >
        <Printer className="h-3.5 w-3.5" aria-hidden />
        Print
      </a>
      <a
        href={`${href}${join}download=1`}
        className={base}
        aria-label={`Download ${label} PDF`}
        title={`Download the ${label} as a PDF`}
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        PDF
      </a>
    </span>
  );
}
