import { ReceiptList } from '@/components/receipts/receipt-list';
import { RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';
import { RECEIPT_COLUMNS, toReceipts } from '@/lib/receipts';

export const metadata = { title: 'Receipts' };
export const dynamic = 'force-dynamic';

/**
 * Proof of every payout NexG has made to you and every cash deposit you have
 * made to NexG. Each one opens as a page you can print or save as a PDF.
 */
export default async function RiderReceipts() {
  const { h, supabase } = await riderContext();
  if (!h) return null;

  const { data, error } = await supabase
    .from('receipt' as never)
    .select(RECEIPT_COLUMNS)
    .eq('party_type', 'rider')
    .eq('party_id', h.rider_id)
    .order('issued_at', { ascending: false })
    .limit(100);

  return (
    <RiderBoard>
      <RiderPageHead
        title="Receipts"
        lead="Every weekly payout NexG sends you and every cash deposit you make, with a receipt you can print or save. You also get each one by email."
      />
      <ReceiptList
        receipts={error ? null : toReceipts(data)}
        empty="No receipts yet. You get one after your first payout or cash deposit."
      />
    </RiderBoard>
  );
}
