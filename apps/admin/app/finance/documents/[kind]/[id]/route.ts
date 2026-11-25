import { NextResponse, type NextRequest } from 'next/server';

import { receiptPdf, reportPdf, settlementPdf, type DocumentResult } from '@/lib/finance-documents';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A branded finance document as a PDF, made now from the records:
 *   /finance/documents/receipt/<payment id>?invoice=<invoice id>
 *   /finance/documents/settlement/<settlement line id>
 *   /finance/documents/report/<YYYY-MM>
 * Opens in the browser to view or print; ?download=1 saves it instead.
 * Only staff who reach Finance get one; the database checks again.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { kind: string; id: string } },
) {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const client = createClient();
  const { kind, id } = params;
  const invoice = request.nextUrl.searchParams.get('invoice') ?? '';

  let result: DocumentResult;
  if (kind === 'receipt' && UUID.test(id) && UUID.test(invoice)) {
    result = await receiptPdf(client, invoice, id);
  } else if (kind === 'settlement' && UUID.test(id)) {
    result = await settlementPdf(client, id);
  } else if (kind === 'report') {
    result = await reportPdf(client, id);
  } else {
    result = { ok: false, status: 404, message: 'There is no such document.' };
  }

  if (!result.ok) {
    return new NextResponse(result.message, {
      status: result.status,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const download = request.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(Buffer.from(result.doc.bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${result.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
