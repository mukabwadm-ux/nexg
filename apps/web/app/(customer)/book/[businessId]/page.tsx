import { CustomerBooking } from '@/components/merchant/booking/customer-booking';

export const metadata = { title: 'Book with a NEXG merchant', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function CustomerBookingPage({ params }: { params: { businessId: string } }) {
  return <CustomerBooking businessId={params.businessId} />;
}
