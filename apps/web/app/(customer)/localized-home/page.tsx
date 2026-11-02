import type { Metadata } from 'next';

import { HomePageContent } from '@/components/home/home-page';
import { getTranslations } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PersonalizedHomePage() {
  const { locale, t } = await getTranslations();
  return <HomePageContent locale={locale} translate={t} />;
}
