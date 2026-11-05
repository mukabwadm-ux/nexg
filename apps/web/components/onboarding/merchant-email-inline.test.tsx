import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import MerchantOnboarding from '../../../../merchant-onboarding/src/MerchantOnboarding.jsx';

describe('merchant inline email verification', () => {
  it('keeps verification beside the email field and gates application submission', () => {
    const html = renderToStaticMarkup(
      <MerchantOnboarding
        initialData={undefined}
        onSubmit={async () => ({})}
        onSaveDraft={undefined}
        onSaveTask={undefined}
        onTaskNavigation={undefined}
        onDemo={undefined}
        onExitDemo={undefined}
        savedHome={undefined}
        applicationStatus={undefined}
        onStatusChange={undefined}
        onBackToMarketplace={undefined}
        authenticatedSession={undefined}
        canSubmit={false}
        emailVerificationAction={<button type="button">Verify email</button>}
        emailVerificationContent={
          <label htmlFor="verification-code">Enter verification code</label>
        }
      />,
    );
    const emailField = html.indexOf('type="email"');
    const verifyAction = html.indexOf('Verify email');
    const codeEntry = html.indexOf('Enter verification code');
    const submitButton = html.match(/<button[^>]*type="submit"[^>]*>Submit<\/button>/)?.[0];

    expect(emailField).toBeGreaterThanOrEqual(0);
    expect(verifyAction).toBeGreaterThan(emailField);
    expect(codeEntry).toBeGreaterThan(verifyAction);
    expect(submitButton).toMatch(/\sdisabled(?:="")?(?:\s|>)/);
    expect(html).toContain('Verify your business email before continuing.');
  });

  it('shows the verified state and enables application submission', () => {
    const html = renderToStaticMarkup(
      <MerchantOnboarding
        initialData={undefined}
        onSubmit={async () => ({})}
        onSaveDraft={undefined}
        onSaveTask={undefined}
        onTaskNavigation={undefined}
        onDemo={undefined}
        onExitDemo={undefined}
        savedHome={undefined}
        applicationStatus={undefined}
        onStatusChange={undefined}
        onBackToMarketplace={undefined}
        authenticatedSession={undefined}
        canSubmit
        emailVerificationAction={
          <span className="mo-email-verified" role="status">
            Email verified
          </span>
        }
      />,
    );
    const submitButton = html.match(/<button[^>]*type="submit"[^>]*>Submit<\/button>/)?.[0];

    expect(html).toContain('class="mo-email-verified" role="status">Email verified');
    expect(submitButton).not.toMatch(/\sdisabled(?:="")?(?:\s|>)/);
    expect(html).not.toContain('Verify your business email before continuing.');
  });
});
