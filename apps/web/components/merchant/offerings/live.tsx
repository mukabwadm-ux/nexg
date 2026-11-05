'use client';

import { useMemo } from 'react';
import type { WorkspaceCatalogueRow } from '@/lib/merchant-workspace-catalogue';
import { OfferingsWorkspace } from './workspace';
import { liveOfferingsSource } from './live-source';

export function LiveOfferings({
  activities,
  rows,
  canEditDrafts,
  initialOfferingId,
  initialActivityId,
}: {
  activities: { id: string; name: string }[];
  rows: WorkspaceCatalogueRow[];
  canEditDrafts: boolean;
  initialOfferingId?: string;
  initialActivityId?: string;
}) {
  const primaryActivity = activities[0]?.id ?? '';
  const catalogue = useMemo(
    () => liveOfferingsSource({ rows, primaryActivity, canEditDrafts }),
    [rows, primaryActivity, canEditDrafts],
  );
  return (
    <OfferingsWorkspace
      preview={false}
      initialProfileId={initialActivityId ?? primaryActivity}
      initialOfferingId={initialOfferingId}
      source={catalogue.source}
      setupActivities={activities}
      canEditDrafts={canEditDrafts}
      isExisting={catalogue.isExisting}
      onUploadImage={catalogue.uploadImage}
    />
  );
}
