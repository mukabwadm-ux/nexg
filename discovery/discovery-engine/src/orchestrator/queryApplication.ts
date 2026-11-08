import type { QueryPlan } from '../../engines/query-understanding/src/index.js';
import { ReadServiceError } from '../contracts/readErrors.js';

/** Safe localized keys only; never echo private text, inferred amounts or source errors. */
export function requireReadyQuery(plan: QueryPlan | undefined): void {
  const conflict = plan?.issues.find(issue => issue.key.endsWith('_conflict'));
  const issue = conflict ?? plan?.issues.find(issue => issue.code === 'clarify') ?? plan?.issues[0];
  if (!issue) return;
  if (issue.code === 'unsupported') throw new ReadServiceError('UNSUPPORTED_CAPABILITY', 422, false, 'correct_request', issue.paths);
  throw new ReadServiceError('CLARIFICATION_REQUIRED', 422, false, 'clarify', issue.paths, undefined, {
    clarificationKey: issue.key, messageKey: `discovery.query.${issue.key}`, affectedPaths: issue.paths,
    options: [{ optionId: 'refine_request', labelKey: 'discovery.query.refine_request' },
      { optionId: 'keep_selected_browse', labelKey: 'discovery.query.keep_selected_browse' }],
  });
}
