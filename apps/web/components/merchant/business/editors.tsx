'use client';
import Link from 'next/link';
import {
  allowedMethods,
  category,
  fields,
  methodLabels,
  modelLabels,
  profiles,
  type Activity,
  type Business,
  type BusinessDocument,
  type Location,
  type Member,
} from './model';
import { Field, Note } from './primitives';
type EditProps<T> = { value: T; onChange: (value: T) => void; data: Business };

function QuestionInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const field = fields[id];
  if (!field) return null;
  const schema = field.schema;
  if (schema.type === 'boolean')
    return (
      <Field label={field.label} hint="Not answered and No are distinct values.">
        <select
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}
        >
          <option value="">Not answered</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </Field>
    );
  if (Array.isArray(schema.enum))
    return (
      <Field label={field.label}>
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">Not answered</option>
          {schema.enum.map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v).replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </Field>
    );
  if (schema.type === 'number' || schema.type === 'integer')
    return (
      <Field label={field.label}>
        <input
          type="number"
          step={schema.type === 'integer' ? 1 : 'any'}
          min={typeof schema.minimum === 'number' ? schema.minimum : undefined}
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </Field>
    );
  if (schema.type === 'string')
    return (
      <Field label={field.label}>
        <input
          value={String(value ?? '')}
          maxLength={typeof schema.maxLength === 'number' ? schema.maxLength : 2000}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      </Field>
    );
  if (
    schema.type === 'array' &&
    typeof schema.items === 'object' &&
    schema.items &&
    Array.isArray((schema.items as Record<string, unknown>).enum)
  ) {
    const choices = (schema.items as { enum: string[] }).enum;
    return (
      <fieldset className="bu-fields">
        <legend>{field.label}</legend>
        {choices.map((v) => (
          <label className="bu-check" key={v}>
            <input
              type="checkbox"
              checked={Array.isArray(value) && value.includes(v)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...(Array.isArray(value) ? value : []), v]
                    : (Array.isArray(value) ? value : []).filter((x) => x !== v),
                )
              }
            />
            {v.replaceAll('_', ' ')}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <Note>
      This structured setting is maintained by its source. Its current value remains available in
      the configuration preview.
    </Note>
  );
}
export function ActivityEditor({ value: a, onChange, data }: EditProps<Activity>) {
  const patch = (x: Partial<Activity>) => onChange({ ...a, ...x });
  const p = category(a.profileId);
  const businessQuestions = (p?.questions ?? []).filter((id) => fields[id]?.owner === 'business');
  const linked = (p?.questions ?? []).filter((id) => fields[id]?.owner !== 'business');
  const needsCoverage = a.methods.some((m) =>
    ['CUSTOMER_LOCATION', 'MERCHANT_DELIVERY', 'PICKUP_RETURN', 'FREIGHT'].includes(m),
  );
  return (
    <div className="bu-fields">
      <div className="bu-form-grid">
        <Field label="Specialty">
          <select
            value={a.profileId}
            onChange={(e) => {
              const next = category(e.target.value)!;
              patch({
                profileId: next.id,
                name: next.name,
                model: next.defaultModel,
                methods: [allowedMethods(next.defaultModel)[0]!],
                answers: {},
                enabled: false,
              });
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.categoryName} · {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Activity type">
          <select
            value={a.model}
            onChange={(e) => {
              const model = e.target.value as Activity['model'];
              patch({ model, methods: [allowedMethods(model)[0]!], enabled: false });
            }}
          >
            {p?.models.map((m) => (
              <option key={m} value={m}>
                {modelLabels[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Activity name">
        <input value={a.name} maxLength={100} onChange={(e) => patch({ name: e.target.value })} />
      </Field>
      <fieldset className="bu-fields">
        <legend>How customers receive this activity</legend>
        {allowedMethods(a.model).map((method) => (
          <label key={method} className="bu-check">
            <input
              type="checkbox"
              checked={a.methods.includes(method)}
              onChange={(e) =>
                patch({
                  methods: e.target.checked
                    ? [...a.methods, method]
                    : a.methods.filter((m) => m !== method),
                })
              }
            />
            {methodLabels[method]}
          </label>
        ))}
      </fieldset>
      <fieldset className="bu-fields">
        <legend>Assigned locations</legend>
        {data.locations.map((l) => (
          <label className="bu-check" key={l.id}>
            <input
              type="checkbox"
              checked={a.locationIds.includes(l.id)}
              onChange={(e) =>
                patch({
                  locationIds: e.target.checked
                    ? [...a.locationIds, l.id]
                    : a.locationIds.filter((id) => id !== l.id),
                })
              }
            />
            {l.name}
          </label>
        ))}
      </fieldset>
      {needsCoverage && (
        <Field
          label="Service coverage"
          hint="Describe the zones or routes covered by this activity. This declaration does not create delivery or travel capacity."
        >
          <textarea
            value={a.coverage}
            maxLength={2000}
            onChange={(e) => patch({ coverage: e.target.value })}
          />
        </Field>
      )}
      {['APPOINTMENT', 'SESSION_CAPACITY', 'SPACE_RESERVATION'].includes(a.model) && (
        <label className="bu-check">
          <input
            type="checkbox"
            checked={a.bookingEnabled}
            onChange={(e) => patch({ bookingEnabled: e.target.checked })}
          />
          Accept scheduled bookings (optional appointments)
        </label>
      )}
      {a.model === 'ASSET_INTERVAL' && (
        <label className="bu-check">
          <input
            type="checkbox"
            checked={a.driver}
            onChange={(e) => patch({ driver: e.target.checked })}
          />
          With-driver rental service
        </label>
      )}
      <Field label="Operational source">
        <select
          value={a.source}
          onChange={(e) =>
            patch({
              source: e.target.value as Activity['source'],
              sourceConfirmed: e.target.value === 'NEXG',
              enabled: e.target.value === 'NEXG' ? a.enabled : false,
            })
          }
        >
          <option>NEXG</option>
          <option>External</option>
        </select>
      </Field>
      <p className="bu-small bu-muted">
        {a.resourceCount} linked sample resources.{' '}
        <Link href="/merchant-live-preview/availability">
          Manage actual schedules and resources in Availability ↗
        </Link>
      </p>
      {businessQuestions.length > 0 && (
        <details>
          <summary>Specialty declarations ({businessQuestions.length})</summary>
          <div className="bu-fields" style={{ marginTop: 10 }}>
            {businessQuestions.map((id) => (
              <QuestionInput
                key={id}
                id={id}
                value={a.answers[id]}
                onChange={(value) => {
                  const answers = { ...a.answers };
                  if (value === undefined) delete answers[id];
                  else answers[id] = value;
                  patch({ answers });
                }}
              />
            ))}
          </div>
          <p className="bu-small bu-muted">Declarations are not verified claims or licences.</p>
        </details>
      )}
      {linked.length > 0 && (
        <details>
          <summary>Related setup ({linked.length})</summary>
          <ul>
            {linked.map((id) => (
              <li key={id}>
                {fields[id]?.label} · managed in {fields[id]?.owner}.{' '}
                {['offerings', 'availability'].includes(fields[id]?.owner ?? '') && (
                  <Link href={`/merchant-live-preview/${fields[id]!.owner}`}>Open ↗</Link>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      <label className="bu-check">
        <input
          type="checkbox"
          checked={a.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        Enable after business setup validation
      </label>
      <Note>
        Business setup does not confirm stock, booking capacity or publication. Existing commitments
        retain their agreed configuration.
      </Note>
    </div>
  );
}
export function LocationEditor({ value: l, onChange, data }: EditProps<Location>) {
  const patch = (x: Partial<Location>) => onChange({ ...l, ...x });
  return (
    <div className="bu-fields">
      <Field label="Location name">
        <input value={l.name} maxLength={100} onChange={(e) => patch({ name: e.target.value })} />
      </Field>
      <Field label="Place type">
        <select
          value={l.type}
          onChange={(e) => patch({ type: e.target.value as Location['type'] })}
        >
          <option value="physical">Physical location</option>
          <option value="service_base">Service base</option>
          <option value="digital_operation">Digital operation</option>
        </select>
      </Field>
      {l.type !== 'digital_operation' && (
        <Field label="Public address">
          <textarea value={l.address} onChange={(e) => patch({ address: e.target.value })} />
        </Field>
      )}
      <Field
        label={l.type === 'digital_operation' ? 'Public channel or contact' : 'Location contact'}
      >
        <input value={l.contact} onChange={(e) => patch({ contact: e.target.value })} />
      </Field>
      <fieldset className="bu-fields">
        <legend>Configured activities at this location</legend>
        {data.activities.map((a) => (
          <label key={a.id} className="bu-check">
            <input
              type="checkbox"
              checked={l.activityIds.includes(a.id)}
              onChange={(e) =>
                patch({
                  activityIds: e.target.checked
                    ? [...l.activityIds, a.id]
                    : l.activityIds.filter((id) => id !== a.id),
                })
              }
            />
            {a.name}
            {!a.enabled ? ' (setup incomplete)' : ''}
          </label>
        ))}
      </fieldset>
      <label className="bu-check">
        <input
          type="checkbox"
          checked={l.published}
          onChange={(e) => patch({ published: e.target.checked })}
        />
        Publish this sample location
      </label>
      <Note>
        Timezone: Africa/Nairobi. Publishing here changes only the local sample. Existing
        obligations must be resolved before closing.
      </Note>
    </div>
  );
}
export function MemberEditor({ value: m, onChange, data }: EditProps<Member>) {
  const patch = (x: Partial<Member>) => onChange({ ...m, ...x });
  return (
    <div className="bu-fields">
      <Field label="Member name">
        <input value={m.name} onChange={(e) => patch({ name: e.target.value })} />
      </Field>
      <Field label="Invitation email">
        <input type="email" value={m.email} onChange={(e) => patch({ email: e.target.value })} />
      </Field>
      <Field label="Role">
        <select value={m.role} onChange={(e) => patch({ role: e.target.value as Member['role'] })}>
          {[
            'Owner',
            'Supervisor',
            'Service provider',
            'Location manager',
            'Viewer',
            'Operator',
            'Driver',
          ].map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
      </Field>
      <fieldset className="bu-fields">
        <legend>Location access</legend>
        {data.locations.map((l) => (
          <label key={l.id} className="bu-check">
            <input
              type="checkbox"
              checked={m.locationIds.includes(l.id)}
              onChange={(e) =>
                patch({
                  locationIds: e.target.checked
                    ? [...m.locationIds, l.id]
                    : m.locationIds.filter((id) => id !== l.id),
                })
              }
            />
            {l.name}
          </label>
        ))}
      </fieldset>
      <Field label="Operational activity">
        <select value={m.activityId} onChange={(e) => patch({ activityId: e.target.value })}>
          <option value="">Business operations</option>
          {data.activities.map((a) => (
            <option value={a.id} key={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Linked resource" hint="Resource links are supplied by the scheduling owner.">
        <input value={m.resource || 'No linked resource'} disabled />
      </Field>
      {data.members.find((member) => member.id === m.id)?.state === 'Invitation pending' ? (
        <Field label="Invitation state">
          <select
            value={m.state}
            onChange={(e) => patch({ state: e.target.value as Member['state'] })}
          >
            <option>Invitation pending</option>
            <option value="Removed">Revoke invitation</option>
          </select>
        </Field>
      ) : (
        m.state !== 'Invitation pending' && (
          <Field label="Membership state">
            <select
              value={m.state}
              onChange={(e) => patch({ state: e.target.value as Member['state'] })}
            >
              <option>Active</option>
              <option>Removed</option>
            </select>
          </Field>
        )
      )}
      <Note>
        The proposed role and location scope are reviewed before saving. Preview invitations remain
        local and send no email.
      </Note>
    </div>
  );
}
export function DocumentEditor({ value: d, onChange, data }: EditProps<BusinessDocument>) {
  return (
    <div className="bu-fields">
      <Field label="Supporting document title">
        <input value={d.name} onChange={(e) => onChange({ ...d, name: e.target.value })} />
      </Field>
      <Field label="Scope">
        <select value={d.scope} onChange={(e) => onChange({ ...d, scope: e.target.value })}>
          <option>Business</option>
          {data.locations.map((l) => (
            <option key={l.id}>{l.name}</option>
          ))}
        </select>
      </Field>
      <Note>
        Supporting evidence is optional. Mandatory requirement definitions and verified states come
        from the document owner. Adding a record here does not verify or upload a file.
      </Note>
    </div>
  );
}
