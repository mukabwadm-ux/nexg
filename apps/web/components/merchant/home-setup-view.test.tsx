import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HomeSetupView } from './home-setup-view';

describe('shared merchant setup Home', () => {
  it('counts required completed rows without treating supplied information as verified', () => {
    const html = renderToStaticMarkup(
      <HomeSetupView
        businessName="Kilimani Clinic"
        rows={[
          { id: 'profile', title: 'Business profile', description: 'Your business details.', actionLabel: 'View profile', status: 'complete', icon: 'business' },
          { id: 'documents', title: 'Documents', description: 'Files supplied for review.', actionLabel: 'View documents', status: 'provided', icon: 'documents' },
          { id: 'payout', title: 'Payout method', description: 'Add your payout details.', actionLabel: 'Set up payouts', status: 'missing', icon: 'payout' },
          { id: 'team', title: 'Team', description: 'An optional setup task.', actionLabel: 'Manage team', status: 'complete', required: false, icon: 'team' },
        ]}
      />,
    );

    expect(html).toContain('1 of 3 completed · 2 remaining');
    expect(html).toContain('aria-valuemax="3" aria-valuenow="1"');
    expect(html).toContain('33%');
    expect(html).toContain('Provided · awaiting review');
    const documentRow = html.split('Files supplied for review.')[1]?.split('</li>')[0];
    expect(documentRow).toContain('Provided · awaiting review');
    expect(documentRow).not.toContain('Completed');
  });

  it('shows host status and review notices while retaining the checklist and help', () => {
    const html = renderToStaticMarkup(
      <HomeSetupView
        businessName="Kilimani Clinic"
        rows={[{ id: 'launch', title: 'Go live', description: 'Wait for business approval.', actionLabel: 'Get help', status: 'waiting', statusLabel: 'Awaiting approval', icon: 'launch' }]}
        reviewState="review"
        status={{ location: { value: 'Address saved', note: 'Confirm your pin to finish.' } }}
        headerNotice={<p role="status">Your latest changes are saved.</p>}
        footer={<p>Reference CLINIC-42</p>}
      />,
    );

    expect(html).toContain('Your business is under review');
    expect(html).toContain('Submitted · awaiting review');
    expect(html).toContain('Awaiting approval');
    expect(html).toContain('Address saved');
    expect(html).toContain('Confirm your pin to finish.');
    expect(html).toContain('Your latest changes are saved.');
    expect(html).toContain('Your location');
    expect(html).toContain('Contact support');
    expect(html).toContain('Reference CLINIC-42');
  });

  it('keeps waiting and completed editors available while launch remains blocked', () => {
    const html = renderToStaticMarkup(
      <HomeSetupView
        businessName="Kilimani Clinic"
        rows={[
          { id: 'payout', title: 'Payout method', description: 'Add your payout details.', actionLabel: 'Add payout', status: 'waiting', statusLabel: 'Details needed', onAction: () => {}, icon: 'payout' },
          { id: 'launch', title: 'Go live', description: 'Wait for approval.', actionLabel: 'Launch business', status: 'waiting', statusLabel: 'Awaiting approval', icon: 'launch' },
          { id: 'profile', title: 'Business profile', description: 'Your saved business details.', actionLabel: 'Review profile', status: 'complete', onAction: () => {}, icon: 'business' },
        ]}
      />,
    );
    const rows = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];

    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('Details needed');
    expect(rows[0]).toMatch(/<button\b[^>]*aria-label="Add payout"[^>]*>/);
    expect(rows[1]).toContain('Awaiting approval');
    expect(rows[1]).not.toContain('<button');
    expect(rows[2]).toContain('Completed');
    expect(rows[2]).toMatch(/<button\b(?![^>]*\sdisabled(?:=|\s|>))[^>]*aria-label="Review profile"[^>]*>/);
  });

  it('shows one control per row: an action button when missing, otherwise a status pill and pencil', () => {
    const html = renderToStaticMarkup(
      <HomeSetupView
        businessName="Kilimani Clinic"
        rows={[
          { id: 'business', title: 'Business profile', description: 'Saved.', actionLabel: 'Edit details', status: 'complete', statusLabel: 'Details submitted', onAction: () => {}, icon: 'business' },
          { id: 'offerings', title: 'Offerings', description: 'None yet.', actionLabel: 'Add offerings', status: 'missing', statusLabel: 'Add offerings', onAction: () => {}, icon: 'offerings' },
          { id: 'documents', title: 'Documents', description: 'Optional.', actionLabel: 'Add if requested', status: 'waiting', statusLabel: 'Add if requested', onAction: () => {}, icon: 'documents' },
        ]}
      />,
    );
    const rows = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];

    expect(rows[0]).toContain('Details submitted');
    expect(rows[0]).toContain('bg-green-600');
    expect(rows[0]).toMatch(/aria-label="Edit details"/);
    expect(rows[1]!.match(/Add offerings/g)).toHaveLength(1);
    expect(rows[1]).toContain('bg-gold');
    expect(rows[2]!.match(/Add if requested/g)).toHaveLength(1);
  });

  it('groups sub-rows behind one row that expands inline', () => {
    const html = renderToStaticMarkup(
      <HomeSetupView
        businessName="Kilimani Clinic"
        rows={[
          {
            id: 'categories', title: 'Business categories and operations', description: 'Salon · Spa', actionLabel: 'Update categories', status: 'waiting', statusLabel: '2 categories', onAction: () => {}, icon: 'specialty',
            subRows: [
              { id: 'model:salon', title: 'Salon operating setup', description: 'Set up.', actionLabel: 'Review setup', status: 'waiting', statusLabel: 'After approval', icon: 'specialty' },
              { id: 'model:spa', title: 'Spa operating setup', description: 'Set up.', actionLabel: 'Review setup', status: 'waiting', statusLabel: 'After approval', icon: 'specialty' },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain('Business categories and operations');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Salon operating setup');
  });
});
