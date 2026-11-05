import React, { useState, lazy, Suspense } from 'react';
import './merchant-onboarding.css';
import { DEMO_REGISTRATION, platformRegistrationHref } from './journey-mode';
const MerchantOnboarding = lazy(() => import('./MerchantOnboarding'));

export default function App() {
  const [demo, setDemo] = useState(false);
  const realHref = platformRegistrationHref(
    import.meta.env.VITE_MERCHANT_PLATFORM_URL,
    import.meta.env.DEV,
  );
  if (demo)
    return (
      <Suspense
        fallback={
          <p className="merchant-onboarding" role="status">
            Opening demo…
          </p>
        }
      >
        <MerchantOnboarding
          key="demo"
          previewMode
          initialHome
          initialData={DEMO_REGISTRATION}
          onSaveDraft={async () => ({ preview: true })}
          onSubmit={async () => ({ preview: true })}
          onExitDemo={() => setDemo(false)}
        />
      </Suspense>
    );
  return (
    <main className="merchant-onboarding">
      <section className="mo-panel">
        <div className="mo-topline">
          <div>
            <span className="mo-kicker">Merchant onboarding · Kenya</span>
            <h1>Set up your business</h1>
            <p>Register with your NEXG account, or explore the workspace with sample data.</p>
          </div>
        </div>
        <div className="mo-actions">
          {realHref ? (
            <a className="mo-button mo-button-primary" href={realHref}>
              Start real registration
            </a>
          ) : (
            <p>Open real registration from your NEXG platform.</p>
          )}
          <button
            type="button"
            className="mo-button mo-button-secondary"
            onClick={() => setDemo(true)}
          >
            Try demo · sample data
          </button>
        </div>
        <p className="mo-help">
          Demo entries stay in this tab and do not create an account or application.
        </p>
      </section>
    </main>
  );
}
