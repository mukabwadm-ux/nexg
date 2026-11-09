import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Input } from './input';

describe('Input password visibility', () => {
  it('starts hidden and shows the password when the eye is pressed', async () => {
    render(<Input id="pw" label="Password" type="password" />);
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');

    const eye = screen.getByRole('button', { name: 'Show password' });
    expect(eye).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(eye);

    expect(field).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('hides it again on a second press, keeping what was typed', async () => {
    render(<Input id="pw" label="Password" type="password" />);
    const field = screen.getByLabelText('Password');
    await userEvent.type(field, 'secret1');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveValue('secret1');
  });

  it('never submits the form it sits in', async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Input id="pw" label="Password" type="password" />
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('adds no button to other field types', () => {
    render(<Input id="email" label="Email" type="email" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
