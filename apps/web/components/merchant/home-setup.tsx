'use client';

import { CircleHelp, MapPin } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { BranchCard, SetupProgress } from './types';
import { HomePanel } from './home-panel';
import { HomeSetupView, type HomeSetupIcon, type HomeSetupRow } from './home-setup-view';

type StepKey =
  | 'step_profile'
  | 'step_hours'
  | 'step_team'
  | 'step_catalogue'
  | 'step_documents'
  | 'step_payout'
  | 'step_live';

const steps: Array<{
  key: StepKey;
  title: string;
  description: string;
  action: string;
  section: string;
  icon: HomeSetupIcon;
}> = [
  {
    key: 'step_profile',
    title: 'Business profile',
    description: 'Name, category, branch address and photos.',
    action: 'View profile',
    section: 'stores',
    icon: 'business',
  },
  {
    key: 'step_hours',
    title: 'Hours',
    description: 'Your weekly opening hours.',
    action: 'Set hours',
    section: 'hours',
    icon: 'hours',
  },
  {
    key: 'step_team',
    title: 'Team & devices',
    description: 'The people and devices that help manage your work.',
    action: 'Manage team',
    section: 'team',
    icon: 'team',
  },
  {
    key: 'step_catalogue',
    title: 'Catalogue',
    description: 'Add your items and prices.',
    action: 'Add items',
    section: 'menu',
    icon: 'offerings',
  },
  {
    key: 'step_documents',
    title: 'Documents',
    description: 'Upload the documents requested for your business.',
    action: 'Upload documents',
    section: 'documents',
    icon: 'documents',
  },
  {
    key: 'step_payout',
    title: 'Payout method',
    description: 'Set up how you want to receive your payouts.',
    action: 'Set up payouts',
    section: 'money',
    icon: 'payout',
  },
  {
    key: 'step_live',
    title: 'Test order & go live',
    description: 'Complete the remaining requirements to continue.',
    action: 'Get help',
    section: 'support',
    icon: 'launch',
  },
];

/** Reused by Home interactions so the merchant can return to the same context. */
function SetupPanel({
  title,
  description,
  href,
  preview,
  children,
  sampleState,
}: {
  title: string;
  description: string;
  href: string;
  preview: boolean;
  children: React.ReactNode;
  sampleState?: 'setup' | 'review' | 'changes';
}) {
  const [payoutMethod, setPayoutMethod] = React.useState('');
  const sampleDocument = preview && title === 'Documents' && sampleState === 'changes';
  const samplePayout = preview && title === 'Payout method';
  return (
    <HomePanel
      title={sampleDocument ? 'Requested document' : title}
      description={sampleDocument ? 'Changes requested · Upload a clearer image.' : description}
      trigger={children}
    >
      {preview ? (
        <p className="text-muted text-sm">
          This is a sample. No changes will be made to a merchant account.
        </p>
      ) : null}
      {sampleDocument ? (
        <label className="border-border rounded-lg border p-3 text-sm font-bold">
          Choose file
          <input
            type="file"
            accept="image/*,.pdf"
            className="mt-2 block w-full text-xs font-normal"
          />
        </label>
      ) : null}
      {samplePayout ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-bold">Choose a payout method</legend>
          {['M-Pesa', 'Bank account'].map((method) => (
            <label
              key={method}
              className="border-border flex items-center gap-3 rounded-lg border p-3 text-sm"
            >
              <input
                type="radio"
                name="sample-payout"
                value={method}
                checked={payoutMethod === method}
                onChange={() => setPayoutMethod(method)}
              />
              {method}
            </label>
          ))}
          <p className="text-muted text-xs">Payout details cannot be submitted from this sample.</p>
        </fieldset>
      ) : null}
      {sampleDocument || samplePayout ? (
        <button
          type="button"
          disabled
          className="mt-auto rounded-lg bg-gray-100 px-4 py-3 text-sm font-bold text-gray-500"
        >
          Continue
        </button>
      ) : (
        <Link
          href={href}
          className="bg-gold text-ink mt-auto rounded-lg px-4 py-3 text-center text-sm font-bold focus-visible:outline focus-visible:outline-2"
        >
          {preview ? 'Open sample details' : 'Continue to details'}
        </Link>
      )}
    </HomePanel>
  );
}

export function HomeSetup({
  businessName,
  progress,
  branches,
  branchesUnavailable = false,
  preview = false,
  sampleState = 'setup',
  businessCategory,
  businessSubcategories = [],
  previewBase,
  previewQuery = '',
}: {
  businessName: string;
  progress: SetupProgress;
  branches: BranchCard[];
  branchesUnavailable?: boolean;
  preview?: boolean;
  sampleState?: 'setup' | 'review' | 'changes';
  businessCategory?: string;
  businessSubcategories?: string[];
  previewBase?: string;
  previewQuery?: string;
}) {
  const previewRoutes: Record<string, string> = {
    stores: '/business?tab=locations',
    hours: '/availability',
    team: '/business?tab=team',
    menu: '/offerings',
    documents: '/business?tab=documents',
    money: '/money',
    support: '/settings',
  };
  const destination = (section: string) => {
    if (!preview) return `/merchant/${section}`;
    if (!previewBase) return `/merchant-preview/${section}`;
    const target = `${previewBase}${previewRoutes[section] ?? `/${section}`}`;
    if (!previewQuery) return target;
    const [pathname, existingQuery = ''] = target.split('?');
    const params = new URLSearchParams(existingQuery);
    for (const [key, value] of new URLSearchParams(previewQuery.replace(/^\?/, ''))) {
      if (key === 'subcategory' || key === 'subcategoryName') params.append(key, value);
      else if (!params.has(key)) params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };
  const activityNames = businessSubcategories.join(', ');
  const activityNotice = businessCategory ? (
    <section
      className="border-border bg-gold-soft/50 flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3"
      aria-label="Demo business activities"
    >
      <div>
        <p className="text-xs font-extrabold">Demo tailored to {businessCategory}</p>
        <p className="text-muted mt-1 text-xs">
          The sample workspace is set up around the activities selected during onboarding.
        </p>
      </div>
      <div className="flex max-w-2xl flex-wrap gap-1.5" aria-label="Selected subcategories">
        {businessSubcategories.map((name) => (
          <span
            key={name}
            className="rounded-full border border-[#d8e5dc] bg-white px-2.5 py-1 text-xs font-semibold"
          >
            {name}
          </span>
        ))}
      </div>
    </section>
  ) : undefined;
  const review = preview && sampleState === 'review';
  const changes = preview && sampleState === 'changes';
  const rows: HomeSetupRow[] = steps.map((step): HomeSetupRow => {
    const done = progress[step.key];
    const blocked = step.key === 'step_live' && !done && !progress.can_go_live;
    const documentReview = step.key === 'step_documents' && review;
    const actionLabel = step.key === 'step_documents' && changes ? 'Review document' : step.action;
    const tailoredDescription =
      step.key === 'step_profile' && businessCategory
        ? `Set up your ${businessCategory} profile, branch address and photos.`
        : step.key === 'step_catalogue' && activityNames
          ? `Add products or services for ${activityNames}.`
          : step.description;
    return {
      id: step.key,
      title: step.title,
      description: documentReview
        ? 'Your submitted documents are being reviewed.'
        : step.key === 'step_documents' && changes
          ? 'Your submitted document needs an update.'
          : tailoredDescription,
      actionLabel,
      status: done ? 'complete' : documentReview ? 'provided' : blocked ? 'waiting' : 'missing',
      statusLabel: blocked ? (review || changes ? 'Awaiting approval' : 'Pending') : undefined,
      icon: step.icon,
      renderAction:
        done || blocked ? undefined : documentReview ? (
          <span className="bg-gold-soft text-gold-text col-start-4 rounded-lg px-2 py-2 text-center text-xs font-bold sm:col-auto">
            Under review
          </span>
        ) : (
          <SetupPanel
            title={step.title}
            description={tailoredDescription}
            href={destination(step.section)}
            preview={preview}
            sampleState={sampleState}
          >
            <button
              type="button"
              className="bg-gold text-ink col-start-4 rounded-lg px-2 py-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 sm:col-auto"
            >
              {actionLabel} →
            </button>
          </SetupPanel>
        ),
    };
  });

  return (
    <HomeSetupView
      businessName={businessName}
      greeting={`Good ${partOfDay()}`}
      rows={rows}
      headerNotice={activityNotice}
      previewLabel={
        preview
          ? `Sample · ${review ? 'under review' : changes ? 'changes needed' : 'setup'}`
          : undefined
      }
      reviewState={review ? 'review' : changes ? 'changes' : 'setup'}
      status={{
        location: {
          value: preview
            ? 'Not visible'
            : branchesUnavailable
              ? 'Unavailable'
              : 'Setup in progress',
          note: preview
            ? 'Your location is not visible yet.'
            : branchesUnavailable
              ? 'Location details could not be loaded.'
              : 'Check your location details below.',
        },
      }}
      locationAction={
        <SetupPanel
          title="Your location"
          description={
            branches.length
              ? `Location: ${branches[0]?.name || 'Unnamed location'}.`
              : 'Location details are unavailable.'
          }
          href={destination('stores')}
          preview={preview}
        >
          <button
            type="button"
            className="border-border bg-surface flex items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2"
          >
            <MapPin className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">Your location</span>
              <span className="text-muted block text-xs">View your location details.</span>
            </span>
            <span className="bg-gold-soft text-gold-text rounded-full px-3 py-1 text-xs font-bold">
              {branchesUnavailable ? 'Unavailable' : 'Setup in progress'}
            </span>
          </button>
        </SetupPanel>
      }
      helpAction={
        <SetupPanel
          title="Need help?"
          description="Find support for your business setup."
          href={destination('support')}
          preview={preview}
        >
          <button
            type="button"
            className="border-border bg-surface flex items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2"
          >
            <CircleHelp className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">Need help?</span>
              <span className="text-muted block text-xs">Get support with your setup.</span>
            </span>
            <span className="bg-gold text-ink rounded-lg px-3 py-2 text-xs font-bold">
              Contact support →
            </span>
          </button>
        </SetupPanel>
      }
    />
  );
}

function partOfDay() {
  const hour = Number(
    new Date().toLocaleString('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }),
  );
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}
