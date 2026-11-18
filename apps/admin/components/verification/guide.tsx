'use client';

import { DetailPanel } from '@nexg/ui';
import { BookOpen } from 'lucide-react';
import * as React from 'react';

export interface GuideRequirement {
  label: string;
  required: boolean;
  essential: boolean;
  expires: boolean;
  /** Category labels it applies to; empty means every merchant. */
  categories: string[];
  /** Asked only when the merchant answered something, e.g. "dispenses prescriptions". */
  conditional: boolean;
}

/**
 * The Verification Guide in the header: how a merchant gets from applying
 * to live, in the order the console enforces it, and the documents the
 * database asks for, read from document_requirement.
 */
export function VerificationGuide({ requirements }: { requirements: GuideRequirement[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border border-white/40 px-4 text-[0.9375rem] font-bold text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE07A]"
      >
        <BookOpen aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
        Verification Guide
      </button>
      <DetailPanel
        open={open}
        onOpenChange={setOpen}
        title="Verification guide"
        subtitle="How a merchant goes from applying to live, and what we ask for."
        width="lg"
      >
        <div className="space-y-6 text-[0.9375rem] leading-relaxed">
          <ol className="space-y-3">
            <li>
              <p className="font-extrabold">1. Application</p>
              <p className="text-muted">
                The merchant applies. On the application form they submit it for review; merchants
                who applied before the form count as submitted.
              </p>
            </li>
            <li>
              <p className="font-extrabold">2. Documents</p>
              <p className="text-muted">
                Open each document from Submitted Documents to view it, verify it, or reject it with
                a reason the merchant reads. Missing ones can be chased or uploaded on their behalf.
                The merchant moves to Under Review on their own once every required document is in.
              </p>
            </li>
            <li>
              <p className="font-extrabold">3. Compliance</p>
              <p className="text-muted">
                The checks: KRA PIN certificate, owner ID, licences, payout account and a search for
                other merchants with the same KRA PIN, phone or email. Nothing checks the payout
                account name yet, so banking only ever shows as provided.
              </p>
            </li>
            <li>
              <p className="font-extrabold">4. Final decision</p>
              <p className="text-muted">
                Approve & Activate needs every required document verified and a primary branch; it
                takes the merchant live and shows it in Discovery. Request More Info sends the
                application or chosen documents back. Reject closes an application made on the form.
              </p>
            </li>
          </ol>

          <section aria-labelledby="guide-docs">
            <h3 id="guide-docs" className="font-extrabold">
              Documents we ask for
            </h3>
            {requirements.length === 0 ? (
              <p className="text-muted mt-2">No document requirements are set up.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#EFEDE8]">
                {requirements.map((r) => (
                  <li
                    key={r.label}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
                  >
                    <span className="font-bold">{r.label}</span>
                    <span className="text-muted text-[0.8125rem] font-semibold">
                      {[
                        r.required ? 'Required' : 'Optional',
                        r.essential ? 'essential' : null,
                        r.expires ? 'has an expiry date' : null,
                        r.categories.length > 0 ? r.categories.join(', ') : 'every merchant',
                        r.conditional ? 'depending on their answers' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DetailPanel>
    </>
  );
}
