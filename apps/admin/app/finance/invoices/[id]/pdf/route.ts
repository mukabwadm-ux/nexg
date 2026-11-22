import { NextResponse, type NextRequest } from 'next/server';

import { invoiceDetail, invoicePdfLink } from '@/lib/client-invoice-pdf';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Downloads a client invoice's PDF through a link valid for a minute. Only
 * staff who reach Finance get one: the invoice reader and storage both
 * check. An invoice with no PDF yet goes back to its panel, where full
 * Finance can make it.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(params.id))
    return NextResponse.redirect(new URL('/finance/invoices', request.url));
  const back = new URL(`/finance/invoices?invoice=${encodeURIComponent(params.id)}`, request.url);
  const client = createClient();
  const { detail } = await invoiceDetail(client, params.id);
  const path = detail?.invoice.pdf_path;
  const number = detail?.invoice.number;
  if (!path || !number) return NextResponse.redirect(back);
  const link = await invoicePdfLink(client, path, number);
  return NextResponse.redirect(link ?? back);
}
