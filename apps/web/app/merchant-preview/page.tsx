import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

export default function MerchantPreviewIndex(): ReactNode {
  redirect('/merchant-preview/dashboard');
}
