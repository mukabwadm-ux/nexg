import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Work preview' };

export default function WorkPreviewPage(): ReactNode {
  redirect('/merchant-live-preview/work');
}
