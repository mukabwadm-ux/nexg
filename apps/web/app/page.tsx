import type { Metadata } from 'next';

import { HomePageContent } from '@/components/home/home-page';

export const metadata: Metadata = {
  title: 'Everything at your Doorstep',
  description:
    'Tell us where you are staying and what you need. A vetted local concierge confirms the plan, the price and the timing, and delivers it to your door.',
};

export const revalidate = 3600;

export default function HomePage() {
  return <HomePageContent locale="en" />;
}
