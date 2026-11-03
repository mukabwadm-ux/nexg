import { redirect } from 'next/navigation';

export default function MerchantPreviewIndex(): import('react').ReactNode {
  redirect('/merchant-preview/dashboard');
}
