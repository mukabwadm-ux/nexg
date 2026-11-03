import { CartBar } from '@/components/cart/add-to-cart';
import { CartProvider } from '@/components/cart/cart-provider';
import { PersonalizedChrome } from '@/components/consent/personalized-chrome';
import { WelcomeGate } from '@/components/consent/welcome-gate';
import { LocationBannerSlot, LocationSheetSlot } from '@/components/location/chrome';
import { SiteLocationProvider } from '@/components/location/provider';
import { DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';
import { canMachineTranslate } from '@/lib/i18n/translate';

export default function CustomerLayout({ children }: { children: import('react').ReactNode }): import('react').ReactNode {
  return (
    <SiteLocationProvider initial={null}>
      <CartProvider>
        <LocationBannerSlot />
        {children}
        <CartBar />
        <LocationSheetSlot />
        <PersonalizedChrome />
        <WelcomeGate locale={DEFAULT_LOCALE} canTranslate={canMachineTranslate()} />
      </CartProvider>
    </SiteLocationProvider>
  );
}
