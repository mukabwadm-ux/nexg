import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/*
 * Finance used to be one page with seven tabs. Its screens now have their
 * own addresses, and the old ones keep working: links stored in the
 * database (fin_decision and fin_calendar_entry rows carry
 * `/finance?tab=…`) and bookmarks land on the screen that replaced the tab.
 */
const MOVED: Record<string, string> = {
  overview: '/finance/reports?tab=financial',
  settlement: '/finance/settlements?tab=batches',
  reconciliation: '/finance/reconciliation',
  fees: '/finance/reports?tab=fees',
  invoices: '/finance/invoices',
  tax: '/finance/reports?tab=tax',
  exports: '/finance/reports?tab=exports',
};

export default function FinancePage({
  searchParams,
}: {
  searchParams?: { tab?: string; run?: string };
}) {
  const tab = searchParams?.tab ?? '';
  let to = MOVED[tab] ?? '/finance/reports';
  if (tab === 'settlement' && searchParams?.run && /^[0-9a-f-]{36}$/i.test(searchParams.run)) {
    to += `&run=${searchParams.run}`;
  }
  redirect(to);
}
