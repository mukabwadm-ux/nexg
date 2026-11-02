import React, { useRef, useState } from "react";
import { HomePanel } from "../../apps/web/components/merchant/home-panel";
import { WorkspaceFrame } from "../../apps/web/components/merchant/workspace/workspace-frame";
import { merchantWorkspaceNavigation } from "../../apps/web/components/merchant/workspace/navigation";
import styles from "../../apps/web/components/merchant/workspace/workspace.module.css";

export default function OnboardingWorkspace({ businessName, onHome, onRegistration, children, contextLabel = "Home", previewMode = true, onExitDemo }) {
  const [section, setSection] = useState("Home");
  const helpButton = useRef(null);
  const mobileNavigation = useRef(null);
  function navigate(label) {
    setSection(label);
    if (mobileNavigation.current) {
      mobileNavigation.current.open = false;
      mobileNavigation.current.querySelector("summary")?.focus();
    }
    if (label === "Home") onHome?.();
  }
  const navigation = <nav className={styles.nav} aria-label="Merchant workspace navigation">
    {merchantWorkspaceNavigation.map(({ label, icon: Icon }) => <button type="button" key={label} className={`${styles.navLink} onboarding-workspace-nav`} aria-current={section === label ? "page" : undefined} onClick={() => navigate(label)}>
      <Icon size={18} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span>{label !== "Home" && <span className="onboarding-workspace-lock-label">Locked</span>}
    </button>)}
  </nav>;
  const activeContent = section === "Home"
    ? typeof children === "function" ? children({ openHelp: () => helpButton.current?.click() }) : children
    : <section className="relative m-4 min-h-[450px] overflow-hidden rounded-xl border border-border bg-bg p-6" aria-labelledby="pending-approval-title">
        <div className="pointer-events-none grid grid-cols-2 gap-6 opacity-40 blur-md" aria-hidden="true" inert="">{[0, 1, 2, 3].map(key => <div className="h-36 rounded-xl border border-border bg-surface" key={key} />)}</div>
        <div className="absolute left-1/2 top-1/2 w-[min(90%,500px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-lg">
          <h1 id="pending-approval-title" className="text-xl font-extrabold">Waiting for admin approval</h1>
          <p className="mt-3 text-sm text-muted">{section} will be available when your account has the required access. You can continue setup from Home.</p>
          <p className="mt-3 text-xs text-muted">No operational records are loaded behind this lock.</p>
          <button type="button" className="mt-5 min-h-11 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink" onClick={() => navigate("Home")}>Back to Home</button>
        </div>
      </section>;
  return <WorkspaceFrame
    activeLabel={section === "Home" ? contextLabel : section}
    businessName="Merchant workspace"
    accountInitials={businessName.trim().slice(0, 2).toUpperCase()}
    navigation={navigation}
    headerStart={<>
      <details className="onboarding-mobile-nav" ref={mobileNavigation}>
        <summary className="onboarding-frame-button" aria-label="Open workspace navigation">Menu</summary>
        {navigation}
      </details>
      <span className={styles.sampleBadge}>{previewMode ? "Demo · sample data" : "Business setup"}</span>
      {previewMode && <span className="onboarding-preview-note onboarding-header-note">No sign-in or admin decision has taken place.</span>}
    </>}
    headerEnd={<>
      {previewMode&&onExitDemo&&<button type="button" className="onboarding-frame-button" onClick={onExitDemo}>Exit demo</button>}
      <button type="button" className="onboarding-frame-button" aria-label="Review registration" onClick={onRegistration}><span className="hidden sm:inline">Review </span>registration</button>
      <HomePanel title="Help with setup" description="Support while you prepare your merchant application." trigger={<button type="button" className="onboarding-frame-button" ref={helpButton}>Help</button>}>
        <p className="text-sm text-muted">{previewMode ? "Your setup details are kept in this tab." : "Save your changes before leaving a setup task."} You can return to Home to complete setup.</p>
        {previewMode && <p className="text-sm text-muted">Live support and application submission are not connected in this preview. Email OTP will be connected later.</p>}
      </HomePanel>
    </>}
  >{activeContent}</WorkspaceFrame>;
}
