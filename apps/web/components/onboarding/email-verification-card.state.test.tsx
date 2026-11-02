import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace() {}, refresh() {} }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));

import { EmailVerificationCard } from './email-verification-card';
import { MerchantEmailVerification } from './merchant-email-verification';

describe('email verification screen', () => {
  it('shows the full code card immediately while the first email is being sent', () => {
    const html = renderToStaticMarkup(<MerchantEmailVerification actorId="owner" email="owner@example.test" />);
    expect(html).toContain('Sending a 6-digit code to');
    expect(html).toContain('name="verification-code"');
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toMatch(/\sdisabled(?:="")?(?:\s|>)/);
  });

  it('keeps the same card and offers a retry when sending fails', () => {
    const html = renderToStaticMarkup(<EmailVerificationCard email="owner@example.test" requestStatus="error" requestMessage="Please try again shortly." onRetryRequest={() => {}} />);
    expect(html).toContain('name="verification-code"');
    expect(html).toContain('Please try again shortly.');
    expect(html).toContain('Try again');
    expect(html).toContain('Return to Home');
  });

  it('allows the code to be verified after the email request succeeds', () => {
    const html = renderToStaticMarkup(<EmailVerificationCard email="owner@example.test" onVerify={async () => {}} />);
    expect(html).toContain('Enter the 6-digit code sent to');
    const submit = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0];
    expect(submit).toContain('type="submit"');
    expect(submit).not.toMatch(/\sdisabled(?:="")?(?:\s|>)/);
  });
});
