import { redirect } from 'next/navigation';
import { LocationStep } from '@/components/onboarding/step-location';

export default function Page() {
  // The old step-by-step application. With the current form on, /merchants/apply
  // sends people to the right place, and these steps must not change a
  // business that applied through the new form.
  if (process.env.MERCHANT_ONBOARDING_V1_ENABLED !== 'false') redirect('/merchants/apply');
  return <LocationStep />;
}
