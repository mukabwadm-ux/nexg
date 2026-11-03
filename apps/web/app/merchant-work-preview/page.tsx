import { redirect } from 'next/navigation';

export const metadata = { title: 'Work preview' };

export default function WorkPreviewPage(): import('react').ReactNode {
  redirect('/merchant-live-preview/work');
}
