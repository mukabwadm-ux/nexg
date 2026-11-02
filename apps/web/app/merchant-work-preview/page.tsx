import { redirect } from 'next/navigation';

export const metadata = { title: 'Work preview' };

export default function WorkPreviewPage() {
  redirect('/merchant-live-preview/work');
}
