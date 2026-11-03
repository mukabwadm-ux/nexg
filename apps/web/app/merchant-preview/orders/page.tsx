import { redirect } from 'next/navigation';

// Keep the existing Work preview link pointed at the adaptive Work preview.
export default function WorkPreviewRedirect(): import('react').ReactNode {
  redirect('/merchant-live-preview/work');
}
