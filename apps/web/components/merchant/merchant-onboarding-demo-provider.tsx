'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import {
  MERCHANT_ONBOARDING_DEMO_STORAGE_KEY,
  parseMerchantOnboardingDemoContext,
  parseStoredMerchantOnboardingDemoContext,
  type MerchantOnboardingDemoContext,
} from '@/lib/merchant-onboarding-demo';

const DemoContext = createContext<MerchantOnboardingDemoContext | null>(null);
export const MERCHANT_ONBOARDING_DEMO_CONTEXT_EVENT = 'nexg:merchant-onboarding-demo-context';

export function useMerchantOnboardingDemoContext() {
  return useContext(DemoContext);
}

export function MerchantOnboardingDemoScope({
  value,
  children,
}: {
  value: MerchantOnboardingDemoContext | null;
  children: ReactNode;
}) {
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function MerchantOnboardingDemoProvider({ children }: { children: ReactNode }) {
  const [demoContext, setDemoContext] = useState<MerchantOnboardingDemoContext | null>(null);

  useEffect(() => {
    const fromUrl = parseMerchantOnboardingDemoContext(new URLSearchParams(window.location.search));
    let next = fromUrl;
    if (!next) {
      try {
        next = parseStoredMerchantOnboardingDemoContext(
          JSON.parse(sessionStorage.getItem(MERCHANT_ONBOARDING_DEMO_STORAGE_KEY) || 'null'),
        );
      } catch {
        next = null;
      }
    }
    if (next) {
      try {
        sessionStorage.setItem(MERCHANT_ONBOARDING_DEMO_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The URL continues to carry the demo context when browser storage is unavailable.
      }
    }
    setDemoContext(next);

    const receiveDemoContext = (event: Event) => {
      const received = parseStoredMerchantOnboardingDemoContext(
        (event as CustomEvent<unknown>).detail,
      );
      if (!received) return;
      setDemoContext((current) =>
        JSON.stringify(current) === JSON.stringify(received) ? current : received,
      );
      try {
        sessionStorage.setItem(MERCHANT_ONBOARDING_DEMO_STORAGE_KEY, JSON.stringify(received));
      } catch {
        // The current page context remains available even if browser storage is unavailable.
      }
    };
    window.addEventListener(MERCHANT_ONBOARDING_DEMO_CONTEXT_EVENT, receiveDemoContext);
    return () => window.removeEventListener(MERCHANT_ONBOARDING_DEMO_CONTEXT_EVENT, receiveDemoContext);
  }, []);

  return <DemoContext.Provider value={demoContext}>{children}</DemoContext.Provider>;
}
