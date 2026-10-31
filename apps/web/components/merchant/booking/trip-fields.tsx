import { Field, inputClass } from './panel';
import type { BookingOffering } from './types';

export function TripFields({ offering }: { offering: BookingOffering }) {
  const transport = offering.transportIncluded !== false;
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-bold">
        {transport ? 'Journey details' : 'Meeting point'}
      </legend>
      <Field label={transport ? 'Pickup area' : 'Meeting area'}>
        <select className={inputClass} name="pickupArea" required>
          <option value="">Choose an area</option>
          {offering.serviceArea?.areas.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
      </Field>
      <Field label={transport ? 'Pickup address' : 'Meeting address or arrival point'}>
        <textarea name="pickupAddress" className={inputClass} required maxLength={1000} rows={2} />
      </Field>
      {transport ? (
        <>
          <Field label="Drop-off area">
            <select className={inputClass} name="dropoffArea" required>
              <option value="">Choose an area</option>
              {offering.serviceArea?.areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Drop-off address">
            <textarea
              name="dropoffAddress"
              className={inputClass}
              required
              maxLength={1000}
              rows={2}
            />
          </Field>
        </>
      ) : null}
    </fieldset>
  );
}

export function tripFromForm(form: FormData) {
  return {
    pickupArea: form.get('pickupArea'),
    pickupAddress: form.get('pickupAddress'),
    dropoffArea: form.get('dropoffArea') || undefined,
    dropoffAddress: form.get('dropoffAddress') || undefined,
  };
}
