import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PhoneInput } from './phone-input';

describe('PhoneInput', () => {
  it('defaults to the Kenyan +254 dialling code', () => {
    render(<PhoneInput id="phone" label="Phone" />);
    expect(screen.getByLabelText('Country dialling code')).toHaveValue('KE');
  });

  it('emits E.164 once the number is complete', async () => {
    const onChange = vi.fn();
    render(<PhoneInput id="phone" label="Phone" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Phone'), '0712345678');

    const [e164] = onChange.mock.calls.at(-1) ?? [];
    expect(e164).toBe('+254712345678');
  });

  it('reports null while the number is still incomplete', async () => {
    const onChange = vi.fn();
    render(<PhoneInput id="phone" label="Phone" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Phone'), '0712');

    const [e164] = onChange.mock.calls.at(-1) ?? [];
    expect(e164).toBeNull();
  });

  it('re-encodes the same digits when the country changes', async () => {
    const onChange = vi.fn();
    render(<PhoneInput id="phone" label="Phone" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Phone'), '0712345678');
    await userEvent.selectOptions(screen.getByLabelText('Country dialling code'), 'UG');

    const [e164] = onChange.mock.calls.at(-1) ?? [];
    expect(e164).toBe('+256712345678');
  });

  it('accepts a stored E.164 value and shows the national part', () => {
    render(<PhoneInput id="phone" label="Phone" value="+254712345678" />);
    expect(screen.getByLabelText('Phone')).toHaveValue('712 345678');
  });

  it('wires the error message to the control for screen readers', () => {
    render(<PhoneInput id="phone" label="Phone" error="Enter a valid M-Pesa number" />);

    const input = screen.getByLabelText('Phone');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'phone-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid M-Pesa number');
  });

  it('locks both controls when disabled', () => {
    render(<PhoneInput id="phone" label="Phone" disabled />);
    expect(screen.getByLabelText('Phone')).toBeDisabled();
    expect(screen.getByLabelText('Country dialling code')).toBeDisabled();
  });
});
