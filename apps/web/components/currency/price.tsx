'use client';

import { useDisplayCurrency } from '@/lib/currency/client';
import { BASE_CURRENCY, formatKes } from '@/lib/currency/money';
import { useClientTranslations } from '@/lib/i18n/client';

/**
 * A KES price in the visitor's chosen currency: "≈ $11.24".
 *
 * For browsing — cards, menus, rates. The KES amount stays in the tooltip,
 * because that is what will be charged. Server-rendered as KES.
 */
export function Price({ kes, className }: { kes: number; className?: string }) {
  const { currency, format } = useDisplayCurrency();
  const text = format(kes);
  const converted = currency !== BASE_CURRENCY && text.startsWith('≈');
  return (
    <span className={className} title={converted ? `${formatKes(kes)}, charged in KES` : undefined}>
      {text}
    </span>
  );
}

/**
 * For anything about to be paid: the KES amount first, as charged, then
 * the converted figure in brackets — "KES 1,450 (≈ $11.24)".
 */
export function ChargedPrice({
  kes,
  className,
  approxClassName = 'font-normal opacity-70',
}: {
  kes: number;
  className?: string;
  approxClassName?: string;
}) {
  const { currency, format } = useDisplayCurrency();
  const approx = currency === BASE_CURRENCY ? null : format(kes);
  return (
    <span className={className}>
      {formatKes(kes)}
      {approx && approx.startsWith('≈') ? (
        <span className={approxClassName}> ({approx})</span>
      ) : null}
    </span>
  );
}

/** One line under a total: what the converted amounts mean. */
export function ChargedInKesNote({ className }: { className?: string }) {
  const { currency } = useDisplayCurrency();
  const { t } = useClientTranslations();
  if (currency === BASE_CURRENCY) return null;
  return <p className={className}>{t('currency.chargedNote', { currency })}</p>;
}
