import { Card } from '@nexg/ui';
import { MERCHANT_TAXONOMY } from '@nexg/contracts';
import Link from 'next/link';

import type { ApplicationReviewRecord, ApplicationReviewSummary, SubmittedApplicationSnapshot } from '@/lib/merchant-application-review-contracts';

import { ApplicationReviewControls } from './application-review-controls';

const STATES: Record<string, string> = { pending: 'Pending review', draft: 'Draft', changes_requested: 'Changes requested', approved: 'Approved', rejected: 'Rejected' };
export const applicationReviewStates = ['pending', 'changes_requested', 'approved', 'rejected', 'draft', 'all'] as const;
type Capture = ApplicationReviewRecord['payload'];
const categoryName = (id: string | null) => MERCHANT_TAXONOMY.find(category => category.id === id)?.name ?? id ?? 'Not selected';
const specialtyName = (id: string) => MERCHANT_TAXONOMY.flatMap(category => category.subcategories).find(specialty => specialty.id === id)?.name ?? id;
function date(value: string | null) { return value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }) + ' EAT' : 'Not submitted'; }
function answer(value: string | boolean | number | null) { return value === null || value === '' ? 'Not provided' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value); }

export function ApplicationReviewBadge({ state }: { state: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${state === 'approved' ? 'bg-success-bg text-success' : state === 'rejected' ? 'bg-danger-bg text-danger' : 'bg-bg text-muted'}`}>{STATES[state] ?? 'Unavailable'}</span>;
}

export function ApplicationReviewQueue({ items, nextCursor, state }: { items: ApplicationReviewSummary[]; nextCursor: string | null; state: string }) {
  return <>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-lg font-extrabold">Managed applications</h2><p className="text-muted mt-1 text-sm">Showing {items.length} in your current review scope. This list includes applications without an assigned city.</p></div>
      <form action="/merchants/applications" method="get" className="flex items-end gap-2"><div><label htmlFor="application-review-state" className="block text-xs font-bold">Review state</label><select id="application-review-state" name="state" defaultValue={state} className="border-border bg-surface mt-1 min-h-11 rounded-lg border px-3 text-sm">{applicationReviewStates.map(value => <option value={value} key={value}>{value === 'all' ? 'All states' : STATES[value]}</option>)}</select></div><button type="submit" className="bg-ink min-h-11 rounded-lg px-4 text-sm font-bold text-white">Apply</button></form>
    </div>
    <div className="border-border bg-surface mt-5 overflow-x-auto rounded-xl border"><table className="w-full min-w-[650px] text-left text-sm"><caption className="sr-only">Managed merchant applications in your review scope</caption><thead className="border-border bg-bg border-b text-xs text-muted"><tr>{['Business', 'Current revision', 'Submitted revision', 'Review state', 'Submitted', ''].map(label => <th scope="col" key={label} className="px-4 py-3 font-bold">{label || <span className="sr-only">Open application</span>}</th>)}</tr></thead><tbody className="divide-border divide-y">
      {items.length === 0 ? <tr><td colSpan={6} className="text-muted px-4 py-10 text-center">No managed applications match this state in your current scope.</td></tr> : items.map(item => <tr key={item.merchantId}><td className="px-4 py-4"><strong className="block">{item.businessName || 'Unnamed business'}</strong><span className="text-muted mt-1 block text-xs">{categoryName(item.categoryId)}</span></td><td className="px-4 py-4">{item.revision}</td><td className="px-4 py-4">{item.submittedRevision ?? 'Not submitted'}{item.needsResubmission && <span className="text-warning mt-1 block text-xs font-bold">Resubmission needed</span>}</td><td className="px-4 py-4"><ApplicationReviewBadge state={item.reviewState} /></td><td className="px-4 py-4 text-xs">{date(item.submittedAt)}</td><td className="px-4 py-4"><Link prefetch={false} href={`/merchants/applications/${item.merchantId}`} className="text-gold-text inline-flex min-h-11 items-center font-bold">Review<span className="sr-only"> {item.businessName || 'application'}</span></Link></td></tr>)}
    </tbody></table></div>
    {nextCursor && <Link prefetch={false} href={`/merchants/applications?${new URLSearchParams({ state, cursor: nextCursor })}`} className="border-border bg-surface mt-4 inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-bold">Next page</Link>}
  </>;
}

export function ApplicationCaptureFacts({ capture }: { capture: Capture }) {
  const business = capture.business;
  return <div className="mt-4 space-y-5">
    <dl className="grid gap-3 sm:grid-cols-2">{[
      ['Business name', business.name], ['First name', business.firstName], ['Last name', business.lastName], ['Email', business.email], ['Contact phone', business.phone], ['Branch count', business.branchCount], ['Registered business', business.registered], ['Same business phone', business.sameBusinessPhone], ['Business phone', business.businessPhone], ['Marketing consent', business.marketing], ['Terms accepted', capture.policies.terms], ['Registry revision', capture.registryRevision],
    ].map(([label, value]) => <div key={String(label)}><dt className="text-muted-light text-xs font-semibold">{label}</dt><dd className="mt-1 break-words text-sm font-bold">{answer(value as string | boolean | number | null)}</dd></div>)}</dl>
    <div><h3 className="text-sm font-extrabold">Selected activities</h3><p className="text-muted mt-2 text-sm">{categoryName(capture.categoryId)}{capture.categoryId && <span className="ml-1 text-xs">({capture.categoryId})</span>}</p><ul className="mt-2 space-y-1 text-sm">{capture.subcategories.map(id => <li key={id}>{specialtyName(id)} <span className="text-muted text-xs">({id})</span></li>)}{capture.subcategories.length === 0 && <li>No specialties selected</li>}</ul></div>
    <div><h3 className="text-sm font-extrabold">Captured activity answers</h3>{Object.entries(capture.answersBySubcategory).map(([id, answers]) => <details key={id} className="border-border mt-2 rounded-lg border p-3"><summary className="min-h-8 cursor-pointer text-sm font-bold">{specialtyName(id)} <span className="text-muted text-xs">{capture.subcategories.includes(id) ? 'Selected' : 'Retained, not selected'}</span></summary><pre className="bg-bg mt-3 whitespace-pre-wrap break-words rounded-lg p-3 text-xs leading-relaxed">{JSON.stringify(answers, null, 2)}</pre></details>)}{Object.keys(capture.answersBySubcategory).length === 0 && <p className="text-muted mt-2 text-sm">No activity answers captured.</p>}</div>
  </div>;
}

export function ApplicationReviewDetail({ actorId, record, submitted, canReview }: { actorId: string; record: ApplicationReviewRecord; submitted: SubmittedApplicationSnapshot | null; canReview: boolean }) {
  const snapshotCurrent = submitted?.revision === record.revision && record.review.submitted_revision === record.revision && !record.review.needs_resubmission;
  return <>
    <div className="mt-6 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold">{record.payload.business.name || 'Unnamed business'}</h2><p className="text-muted mt-1 text-sm">Current revision {record.revision} · Submitted revision {submitted?.revision ?? 'none'} · Publication: {record.publication.status}</p></div><ApplicationReviewBadge state={record.review.state} /></div>
    {!snapshotCurrent && <aside className="border-warning/30 bg-warning-bg mt-4 rounded-xl border p-4 text-sm" role="note">{submitted ? 'The current saved application differs from the submitted snapshot. A new submission is required before a decision.' : 'No submitted snapshot is available. This application cannot receive a review decision yet.'}</aside>}
    <div className="mt-5 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-5"><Card className="p-5"><h2 className="text-base font-extrabold">Submitted snapshot</h2>{submitted ? <><p className="text-muted mt-2 text-sm">Revision {submitted.revision} · {date(submitted.submitted_at)}. These are the exact facts submitted for review.</p><ApplicationCaptureFacts capture={submitted.payload} /></> : <p className="text-muted mt-2 text-sm">The merchant has not submitted this application.</p>}</Card><Card className="p-5"><details><summary className="min-h-8 cursor-pointer text-base font-extrabold">Current saved application · revision {record.revision}</summary><p className="text-muted mt-2 text-sm">Saved facts can change independently of the submitted snapshot.</p><ApplicationCaptureFacts capture={record.payload} /></details></Card></div>
      <aside className="space-y-4"><ApplicationReviewControls key={`${actorId}:${record.merchant_id}:${record.revision}:${record.review.state}`} actorId={actorId} merchantId={record.merchant_id} revision={record.revision} canReview={canReview && snapshotCurrent && record.review.state === 'pending'} />{record.review.reason && <Card className="p-5"><h2 className="text-sm font-extrabold">Recorded review reason</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{record.review.reason}</p></Card>}<Card className="p-5"><h2 className="text-sm font-extrabold">Separate activation</h2><p className="text-muted mt-2 text-sm leading-relaxed">This review changes application access only. Document verification, finance checks, publication and accepting work remain separate.</p></Card></aside>
    </div>
  </>;
}

export function ApplicationReviewUnavailable({ status = 503, href = '/merchants/applications' }: { status?: number; href?: string }) {
  return <Card className="mt-6 p-5"><h2 className="text-base font-extrabold">{status === 401 || status === 403 ? 'Review access unavailable' : status === 404 ? 'Application unavailable' : 'Applications could not be loaded'}</h2><p role="alert" className="text-muted mt-2 text-sm">{status === 401 || status === 403 ? 'Use a current staff account with the required merchant review scope.' : status === 404 ? 'This application was not found in your current review scope.' : 'The current application source is unavailable. Reload before making a decision.'}</p><a href={href} className="text-gold-text mt-3 inline-flex min-h-11 items-center text-sm font-bold underline">Reload applications</a></Card>;
}
