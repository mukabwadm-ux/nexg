import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders its label and responds to a click', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Place your Order</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Place your Order' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is reachable and activatable from the keyboard', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue</Button>);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('blocks interaction and announces itself while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingText="Sending…" onClick={onClick}>
        Send code
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Sending…');

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Activate rider
      </Button>,
    );

    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button" so it cannot submit a form by accident', () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('renders as a link when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/riders/apply">Become a rider</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Become a rider' })).toHaveAttribute(
      'href',
      '/riders/apply',
    );
  });
});
