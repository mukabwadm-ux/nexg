'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { appendMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import {
  createOffering,
  defaultConfiguration,
  type Catalogue,
  type OfferingProfile,
} from '../offerings/model';
import { localOfferingsSource } from '../offerings/source';
import { OfferingsWorkspace } from '../offerings/workspace';
import { DEMO_DATE, flightServicesFor, type FlightService } from './model';

function flightCatalogue(profile: OfferingProfile, services: readonly FlightService[]): Catalogue {
  const at = `${DEMO_DATE}T06:40:00Z`;
  return {
    revision: 1,
    configuration: defaultConfiguration(profile),
    offerings: services.map((service) => ({
      ...createOffering(profile, profile.schema, service.id),
      name: service.name,
      description: service.description,
      publication: 'published',
      fields: {
        request_fields: service.requirements,
        response_owner_reference: 'Heliflight operations',
        quote_terms_schema_reference:
          'Whole charter in USD. Written operator confirmation required.',
        delivery_acceptance_policy: 'Operator confirms the agreed itinerary and completed flight.',
      },
      version: 1,
      updatedAt: at,
      history: [{ at, action: 'Sample flight service created', version: 1 }],
    })),
  };
}

export function useFlightCatalogue() {
  const context = useMerchantOnboardingDemoContext();
  return useMemo(() => {
    const services = flightServicesFor(context?.subcategories ?? []);
    const profile: OfferingProfile = {
      id: `heliflight_${services.map((service) => service.id).join('_')}`,
      categoryId: 'flights_aviation',
      name: 'Flight services',
      schema: 'FLIGHT_CHARTER_QUOTE_V1',
      models: [],
      attributes: [],
    };
    return {
      profile,
      profiles: [profile],
      configuration: defaultConfiguration(profile),
      source: localOfferingsSource(
        {
          getItem: (key) => window.localStorage.getItem(key),
          setItem: (key, value) => window.localStorage.setItem(key, value),
          removeItem: (key) => window.localStorage.removeItem(key),
        },
        (activeProfile) => flightCatalogue(activeProfile, services),
      ),
    };
  }, [context]);
}

export function FlightOfferings() {
  const context = useMerchantOnboardingDemoContext();
  const catalogue = useFlightCatalogue();

  return (
    <OfferingsWorkspace
      key={catalogue.configuration.subcategoryId}
      configuration={catalogue.configuration}
      additionalProfiles={catalogue.profiles}
      source={catalogue.source}
      renderItemAction={(item) => {
        if (item.publication === 'archived') return null;
        const params = new URLSearchParams({ compose: '1', service: item.id });
        return (
          <Link
            className="of-button of-primary"
            href={appendMerchantOnboardingDemoContext(
              `/merchant-live-preview/work?${params}`,
              context,
            )}
          >
            Build quote <ArrowRight size={15} aria-hidden="true" />
          </Link>
        );
      }}
    />
  );
}
