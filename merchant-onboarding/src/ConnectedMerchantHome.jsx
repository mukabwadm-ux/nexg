import React, { useMemo } from "react";
import { HomeSetupView } from "../../apps/web/components/merchant/home-setup-view";
import { projectOnboardingHome } from "../../packages/booking-config/src/onboarding-home";
import OnboardingWorkspace from "./OnboardingWorkspace";

export default function ConnectedMerchantHome({ form, files, selection, onEdit, onRegistration, previewMode = true, embedded = false, applicationStatus, savedHome, onExitDemo }) {
  const capturedProjection = useMemo(() => previewMode?projectOnboardingHome(form, {
    evidence: Object.entries(files).map(([id, file]) => ({ id, name: file.name, size: file.size, type: file.type, status: "selected" })),
    ...(previewMode ? { preview: true } : {}),
  }):null, [form, files, previewMode]);
  if(!previewMode && savedHome?.source!=='saved')return <section className="p-6" role="status"><h1>We could not load your workspace</h1><p>Open your workspace to load the current saved setup and review status.</p><a href="/merchant" className="font-bold underline">Open saved Home</a></section>;
  const projection = previewMode?capturedProjection:savedHome.projection;
  // Reuse the registration's canonical display labels, including the historical
  // café encoding correction, without changing registry IDs or setup rules.
  const displayNames = new Map((selection?.profiles || []).map(profile => [profile.subcategoryId, profile.name]));
  const rows = projection.rows.map(row => {
    const profile = projection.profiles.find(item => row.id === `specialty:${item.subcategoryId}` || row.id === `model:${item.subcategoryId}`);
    const name = profile && displayNames.get(profile.subcategoryId);
    const display = value => profile && name ? value.replaceAll(profile.name, name).replaceAll(profile.name.toLowerCase(), name.toLowerCase()) : value;
    if(!previewMode && row.id.startsWith('model:') && !savedHome.access.operations)return {...row,title:display(row.title),status:'waiting',statusLabel:'After approval',description:'Complete the booking workspace setup after your account has the required approval.',onAction:undefined};
    if(!previewMode && row.id==='team')return {...row,title:'Team access',status:row.status,statusLabel:savedHome.access.operations?(row.statusLabel||'Set up if relevant'):'After approval',actionLabel:'Manage team',description:savedHome.access.operations?'Invite and manage workspace members in the Team area. Booking resources are configured separately in the relevant availability workflow.':'Manage workspace members after your account has operational access. Booking resources are configured separately in the relevant availability workflow.',onAction:savedHome.access.operations?()=>onEdit(row.editorStep,row.id):undefined};
    return { ...row, title: display(row.title), description: display(row.description),
      onAction: row.editorStep === null ? undefined : () => onEdit(row.editorStep,row.id) };
  });
  const reviewState=previewMode?applicationStatus:savedHome.review.state;
  const needsResubmission=!previewMode&&savedHome.review.needsResubmission;
  const approved = reviewState === "approved" && !needsResubmission;
  const published = !previewMode && savedHome.publication.status==='live';
  const content = openHelp => <HomeSetupView
      businessName={projection.businessName}
      rows={rows}
      previewLabel={previewMode ? "Demo · setup" : approved ? "Workspace approved · setup" : "Application · setup"}
      reviewState="setup"
      greeting="Welcome"
      status={{
        business: { value: "Setting up", note: previewMode ? "Your details are captured locally. Account review has not started." : "Your application details are saved. Setup and publication have separate requirements." },
        location: { value: published?"Visible":"Not visible", note: published?"Your published business is visible.":"Your business is not published." },
        acceptingWork: { value: "Not yet", note: "Approval and applicable readiness checks are still needed." },
      }}
      onLocation={() => onEdit(2)}
      onHelp={openHelp}
      headerNotice={<aside className="rounded-xl border border-gold/30 bg-gold-soft px-4 py-3" aria-label="Approval status">
        <strong className="text-sm">{previewMode ? "Waiting for admin approval" : needsResubmission ? "Resubmit your saved changes" : approved ? "Workspace approved" : reviewState === "changes_requested" ? "Update your application" : reviewState === "draft" ? "Finish your registration" : "Waiting for admin approval"}</strong>
        <p className="mt-1 text-xs text-muted">{approved ? published ? "Your approved workspace is available and your business is published. Accepting work has separate requirements." : "Your approved workspace is available. Your business remains unpublished until activation requirements are met." : "Continue the applicable setup below. Operational sections remain locked."}</p>
        {!previewMode && (reviewState === "changes_requested" || needsResubmission) && savedHome.review.reason && <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-sm"><strong>Review feedback · submitted revision {savedHome.review.submittedRevision}</strong><p className="mt-1 whitespace-pre-wrap">{savedHome.review.reason}</p></div>}
        {previewMode && <p className="mt-1 text-xs text-muted">Preview only. Email OTP, backend submission and real approval are not connected. Refreshing or closing this tab clears your entries.</p>}
        {!previewMode && <button type="button" className="mt-3 text-sm font-bold underline" onClick={onRegistration}>{needsResubmission || reviewState === "draft" || reviewState === "changes_requested" ? "Review and submit registration" : "Review registration"}</button>}
      </aside>}
      footer={<section className="rounded-xl border border-border bg-surface p-4" aria-label="Selected merchant activities">
        <h2 className="text-sm font-extrabold">Your activities guide the portal</h2>
        {projection.profiles.map(profile => <p className="mt-2 text-xs text-muted" key={profile.subcategoryId}><strong>{displayNames.get(profile.subcategoryId) || profile.name}:</strong> {profile.specialtyNeeds}</p>)}
        <p className="mt-3 text-xs text-muted">Progress counts applicable required tasks only. Details supplied are distinct from verified evidence, approval or permission to go live.</p>
      </section>}
    />;
  return embedded ? content(() => { window.location.assign('/merchant/support'); }) :
    <OnboardingWorkspace businessName={projection.businessName} onRegistration={onRegistration} previewMode={previewMode} onExitDemo={onExitDemo}>{({openHelp})=>content(openHelp)}</OnboardingWorkspace>;
}
