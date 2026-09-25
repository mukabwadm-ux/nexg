import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'UI kit',
  description: 'Every NexG component in every state.',
  robots: { index: false, follow: false },
};

export default function UiKitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
