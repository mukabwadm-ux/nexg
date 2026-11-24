import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { CAREERS_BOARD_OPEN } from '@/lib/careers/open';

/* While the public job board is off, its pages send visitors to /careers. */
export default function Layout({ children }: { children: ReactNode }) {
  if (!CAREERS_BOARD_OPEN) redirect('/careers');
  return children;
}
