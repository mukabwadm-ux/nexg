import type { BookingReadiness, ConfigurationIssue } from './types';

export function issueText(issue: string | ConfigurationIssue): string {
  return typeof issue === 'string'
    ? issue
    : (issue.message ?? issue.label ?? 'Review this workflow detail in booking setup.');
}

export function WorkflowReadiness({ value }: { value?: BookingReadiness }) {
  if (!value) return null;
  const issues = [
    ...(value.invalidInputs ?? []),
    ...(value.clarifications ?? []),
    ...(value.missingInputs ?? []),
  ];
  if (!issues.length) return null;
  return (
    <details className="border-border rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-bold">
        Setup details to review ({issues.length})
      </summary>
      <ul className="text-muted mt-3 list-disc space-y-2 pl-4 text-xs leading-relaxed">
        {issues.map((issue, index) => (
          <li key={index}>{issueText(issue)}</li>
        ))}
      </ul>
    </details>
  );
}
