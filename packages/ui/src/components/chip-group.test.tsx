import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChipGroup } from './chip-group';

const VEHICLES = [
  { value: 'motorbike', label: 'Motorbike' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'car', label: 'Car' },
] as const;

describe('ChipGroup', () => {
  it('renders single-select as a radio group', () => {
    render(<ChipGroup id="vehicle" label="Vehicle" options={VEHICLES} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    render(<ChipGroup id="vehicle" label="Vehicle" options={VEHICLES} onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Bicycle' }));
    expect(onChange).toHaveBeenCalledWith('bicycle');
  });

  it('moves selection with the arrow keys', async () => {
    const onChange = vi.fn();
    render(
      <ChipGroup
        id="vehicle"
        label="Vehicle"
        options={VEHICLES}
        value="motorbike"
        onChange={onChange}
      />,
    );

    screen.getByRole('radio', { name: 'Motorbike' }).focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenLastCalledWith('bicycle');
    expect(screen.getByRole('radio', { name: 'Bicycle' })).toHaveFocus();
  });

  it('wraps from the first chip to the last', async () => {
    // Controlled wrapper: selection must actually move for wrapping to be real.
    function Harness() {
      const [value, setValue] = useState<string | null>('motorbike');
      return (
        <ChipGroup
          id="vehicle"
          label="Vehicle"
          options={VEHICLES}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);

    screen.getByRole('radio', { name: 'Motorbike' }).focus();
    await userEvent.keyboard('{ArrowLeft}');

    expect(screen.getByRole('radio', { name: 'Car' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Car' })).toHaveFocus();
  });

  it('arrowing back onto the selected chip keeps it selected', async () => {
    // A radio group never clears on navigation, only on a pointer re-click.
    function Harness() {
      const [value, setValue] = useState<string | null>('motorbike');
      return (
        <ChipGroup
          id="vehicle"
          label="Vehicle"
          options={VEHICLES}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);

    screen.getByRole('radio', { name: 'Motorbike' }).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');

    expect(screen.getByRole('radio', { name: 'Motorbike' })).toBeChecked();
  });

  it('clears an optional single-select when the chosen chip is clicked again', async () => {
    const onChange = vi.fn();
    render(
      <ChipGroup id="vehicle" label="Vehicle" options={VEHICLES} value="car" onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Car' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('exposes the group as a single tab stop', async () => {
    render(<ChipGroup id="vehicle" label="Vehicle" options={VEHICLES} value="car" />);

    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Car' })).toHaveFocus();

    // Tabbing again leaves the group rather than landing on the next chip.
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Car' })).not.toHaveFocus();
  });

  it('toggles values in multiple mode', async () => {
    const onChange = vi.fn();
    render(
      <ChipGroup
        id="categories"
        label="Categories"
        multiple
        options={VEHICLES}
        value={['motorbike']}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Car' }));
    expect(onChange).toHaveBeenCalledWith(['motorbike', 'car']);
  });

  it('cannot be cleared when required', async () => {
    const onChange = vi.fn();
    render(
      <ChipGroup
        id="vehicle"
        label="Vehicle"
        required
        options={VEHICLES}
        value="car"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Car' }));
    expect(onChange).toHaveBeenCalledWith('car');
  });

  it('shows an empty message when there are no options', () => {
    render(<ChipGroup id="city" label="City" options={[]} emptyMessage="No cities are open yet" />);
    expect(screen.getByText('No cities are open yet')).toBeInTheDocument();
  });

  it('skips disabled chips when navigating', async () => {
    const onChange = vi.fn();
    render(
      <ChipGroup
        id="vehicle"
        label="Vehicle"
        options={[
          { value: 'motorbike', label: 'Motorbike' },
          { value: 'bicycle', label: 'Bicycle', disabled: true },
          { value: 'car', label: 'Car' },
        ]}
        value="motorbike"
        onChange={onChange}
      />,
    );

    screen.getByRole('radio', { name: 'Motorbike' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('car');
  });
});
