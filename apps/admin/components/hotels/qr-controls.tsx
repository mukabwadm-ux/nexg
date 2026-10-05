'use client';

import { Button, Card, Input, Select, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { Outcome } from '@/app/hotels/qr-actions';

import { PLACEMENTS } from './qr-shared';

/** The buttons on the QR tab. */

function useRun() {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return {
    pending,
    run: async (fn: () => Promise<Outcome>) => {
      setPending(true);
      const result = await fn();
      setPending(false);
      toast({
        title: result.ok ? 'Done' : 'Not allowed',
        description: result.message ?? '',
        tone: result.ok ? 'success' : 'danger',
      });
      if (result.ok) router.refresh();
    },
  };
}

/**
 * Making a card.
 *
 * The spot is a required choice rather than a default, because the
 * whole value of this tab is being able to say "your fridge card
 * converts at three times your counter card" — and that sentence is
 * only possible if somebody said where each one went.
 */
export function GenerateCard({
  properties,
  onGenerate,
}: {
  properties: { id: string; label: string; kind: 'unit' | 'hotel_room' | 'hotel_area' }[];
  onGenerate: (
    kind: 'unit' | 'hotel_room' | 'hotel_area',
    id: string,
    placement: string,
  ) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [property, setProperty] = React.useState(properties[0]?.id ?? '');
  const [placement, setPlacement] = React.useState('counter');

  if (properties.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-[0.875rem] font-extrabold">Make a card</h3>
        <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.7]">
          There are no live units or rooms to put a card in yet. A unit has to be live before its
          card can resolve to something orderable — otherwise a guest scans it and reaches a
          friendly dead end.
        </p>
      </Card>
    );
  }

  const chosen = properties.find((p) => p.id === property);

  return (
    <Card className="p-5">
      <h3 className="text-[0.875rem] font-extrabold">Make a card</h3>
      <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
        The code is generated here and cannot be chosen — that is what makes the scan count mean
        something and stops two properties claiming the same card.
      </p>

      <div className="mt-4 space-y-3">
        <Select
          id="qr-property"
          label="Property"
          value={property}
          onValueChange={setProperty}
          options={properties.map((p) => ({ value: p.id, label: p.label }))}
        />
        <Select
          id="qr-placement"
          label="Where it goes"
          value={placement}
          onValueChange={setPlacement}
          options={[...PLACEMENTS]}
          hint="One live card per spot. A unit can hold a counter card and a fridge card at once — that is how placement gets compared."
        />
      </div>

      <Button
        block
        variant="black"
        className="mt-4"
        loading={pending}
        disabled={pending || !chosen}
        onClick={() => chosen && run(() => onGenerate(chosen.kind, chosen.id, placement))}
      >
        Generate the code
      </Button>
    </Card>
  );
}

/** Replace, void, or check that a card works. */
export function CardActions({
  qrId,
  code,
  voided,
  webOrigin,
  onReplace,
  onVoid,
  onTest,
}: {
  qrId: string;
  code: string;
  voided: boolean;
  webOrigin: string;
  onReplace: (id: string, reason: string) => Promise<Outcome>;
  onVoid: (id: string, reason: string) => Promise<Outcome>;
  onTest: (id: string) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [reason, setReason] = React.useState('');

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={`${webOrigin}/q/${code}/card`}
          target="_blank"
          rel="noreferrer"
          className="border-border hover:bg-bg rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold"
        >
          Print the card
        </a>
        <a
          href={`${webOrigin}/api/qr/${code}?png&size=1200`}
          target="_blank"
          rel="noreferrer"
          className="border-border hover:bg-bg rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold"
        >
          Download PNG
        </a>
        {!voided && (
          <Button
            size="sm"
            variant="ghost"
            loading={pending}
            onClick={() => run(() => onTest(qrId))}
          >
            Test it
          </Button>
        )}
      </div>

      {!voided && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1">
            <Input
              id={`qr-reason-${qrId}`}
              label="Reason"
              labelHidden
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why it is being replaced or voided"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || reason.trim() === ''}
            onClick={() => run(() => onReplace(qrId, reason))}
          >
            Replace
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || reason.trim() === ''}
            onClick={() => run(() => onVoid(qrId, reason))}
          >
            Void
          </Button>
        </div>
      )}
    </div>
  );
}

export function RefreshReports({ onRefresh }: { onRefresh: () => Promise<Outcome> }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" loading={pending} onClick={() => run(onRefresh)}>
      Rebuild the numbers
    </Button>
  );
}
