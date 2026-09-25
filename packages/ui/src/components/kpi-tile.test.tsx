import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KpiTile, VALUE_PLACEHOLDER } from './kpi-tile';

describe('KpiTile', () => {
  // Spec ground rule 3: no invented business numbers.
  it('renders the [—] placeholder when no value is configured', () => {
    render(<KpiTile label="Merchants total" />);
    expect(screen.getByText(VALUE_PLACEHOLDER)).toBeInTheDocument();
  });

  it('renders [—] for null rather than falling back to zero', () => {
    render(<KpiTile label="Live and accepting" value={null} />);
    expect(screen.getByText(VALUE_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders a real zero when zero is the actual value', () => {
    render(<KpiTile label="Blocked over 5 days" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText(VALUE_PLACEHOLDER)).not.toBeInTheDocument();
  });

  it('shows the unit only alongside a real value', () => {
    const { rerender } = render(<KpiTile label="Avg time to live" value={7} unit="d" />);
    expect(screen.getByText('d')).toBeInTheDocument();

    rerender(<KpiTile label="Avg time to live" value={null} unit="d" />);
    expect(screen.queryByText('d')).not.toBeInTheDocument();
  });

  it('hides the caption while loading', () => {
    render(<KpiTile label="Documents on file" value={12} caption="across 4 riders" loading />);
    expect(screen.queryByText('across 4 riders')).not.toBeInTheDocument();
  });

  it('replaces the value with an error note', () => {
    render(<KpiTile label="Documents on file" value={12} error="Unavailable" />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('12')).not.toBeInTheDocument();
  });
});
