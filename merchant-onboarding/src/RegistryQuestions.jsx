import React from 'react';

function QuestionInput({ question, value, onChange, id }) {
  const schema = question.schema;
  const choices = schema.enum || (schema.type === 'array' ? schema.items?.enum : undefined);
  if (schema.type === 'boolean')
    return (
      <select
        id={id}
        value={value === undefined ? '' : String(value)}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : event.target.value === 'true')
        }
      >
        <option value="">Choose later</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  if (schema.type === 'array' && choices)
    return (
      <div className="mo-check-grid">
        {choices.map((choice) => (
          <label className="mo-check" key={String(choice)}>
            <input
              type="checkbox"
              checked={Array.isArray(value) && value.includes(choice)}
              onChange={(event) => {
                const selected = event.target.checked
                  ? [...(value || []), choice]
                  : (value || []).filter((item) => item !== choice);
                onChange(selected.length ? selected : undefined);
              }}
            />
            <span>{String(choice).replaceAll('_', ' ')}</span>
          </label>
        ))}
      </div>
    );
  if (choices)
    return (
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">Choose later</option>
        {choices.map((choice) => (
          <option key={String(choice)} value={choice}>
            {String(choice).replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    );
  if (schema.type === 'number' || schema.type === 'integer')
    return (
      <input
        id={id}
        type="number"
        value={value ?? ''}
        step={schema.type === 'integer' ? '1' : 'any'}
        min={schema.minimum}
        max={schema.maximum}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : Number(event.target.value))
        }
      />
    );
  if (schema.type === 'string')
    return (
      <input
        id={id}
        type="text"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      />
    );
  return (
    <p className="mo-help">This needs a specialist setup editor. Its connection is a later step.</p>
  );
}

export default function RegistryQuestions({ selection, answers, onChange, assessments = [] }) {
  if (!selection.profiles.length) return null;
  return (
    <div className="mo-registry-questions">
      {selection.profiles.map((profile) => (
        <details className="mo-subpanel" key={profile.subcategoryId}>
          <summary>
            {profile.name} details <span className="mo-optional">Optional for now</span>
          </summary>
          <p className="mo-help">
            Tell us what you know now. These answers help tailor your setup; they do not activate
            services.
          </p>
          <div className="mo-grid">
            {selection.questions
              .filter((question) => question.subcategoryIds.includes(profile.subcategoryId))
              .map((question) => {
                const id = `question-${profile.subcategoryId}-${question.id}`;
                const assessment = assessments.find(
                  (row) =>
                    row.subcategoryId === profile.subcategoryId && row.questionId === question.id,
                );
                const messages = assessment?.state === 'invalid' ? assessment.messages : [];
                return (
                  <div className={`mo-field ${messages.length ? 'has-error' : ''}`} key={id}>
                    <label htmlFor={id}>
                      {question.label} <span className="mo-optional">Optional</span>
                    </label>
                    <QuestionInput
                      question={question}
                      id={id}
                      value={answers[profile.subcategoryId]?.[question.id]}
                      onChange={(value) => onChange(profile.subcategoryId, question.id, value)}
                    />
                    {messages.length > 0 && (
                      <span className="mo-error" role="alert">
                        Check this answer. {messages.join(' ')}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </details>
      ))}
    </div>
  );
}
