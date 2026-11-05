'use client';

import { useRouter } from 'next/navigation';

import { appendMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import type { MerchantWorkspaceSection } from '../workspace/navigation';
import { AviationFleetBoard } from './fleet-board';
import { FlightWork } from './flight-work';
import { FlightHome } from './home';
import { FlightOfferings } from './offerings';
import {
  FlightBusiness,
  FlightInsights,
  FlightMoney,
  FlightPromotions,
  FlightSettings,
} from './sections';
import { useAviationDemoState } from './use-demo-state';

export function AviationWorkspace({ section }: { section: MerchantWorkspaceSection }) {
  const { state, setState, ready, storageWarning, reset } = useAviationDemoState();
  const context = useMerchantOnboardingDemoContext();
  const router = useRouter();

  if (!ready) {
    return (
      <p className="text-muted p-6 text-sm" role="status">
        Loading sample flight records…
      </p>
    );
  }

  if (section === 'Business') return <FlightBusiness />;
  if (section === 'Money') return <FlightMoney flights={state.flights} />;
  if (section === 'Promotions') return <FlightPromotions />;
  if (section === 'Insights') return <FlightInsights flights={state.flights} />;

  const sections = {
    Home: <FlightHome state={state} />,
    Work: <FlightWork state={state} onChange={setState} />,
    Offerings: <FlightOfferings />,
    Availability: (
      <AviationFleetBoard
        state={state}
        onChange={setState}
        onOpenFlight={(id) =>
          router.push(
            appendMerchantOnboardingDemoContext(
              `/merchant-live-preview/work?flight=${id}`,
              context,
            ),
          )
        }
      />
    ),
    Settings: <FlightSettings reset={reset} />,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-aviation-workspace>
      {storageWarning && (
        <p role="status" className="bg-gold/10 px-6 py-2 text-sm">
          {storageWarning}
        </p>
      )}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{sections[section]}</div>
    </div>
  );
}
