import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { BaselineReleaseReader } from '../releases/baselineReleaseReader.js';
import { evaluate, EvaluationError } from '../../engines/evaluation-learning/src/index.js';
import { readEvaluationFile, writeEvaluationReport } from './artifacts.js';

const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
try {
  if (process.argv.length !== 3) throw new EvaluationError('USE_EVALUATE_BUNDLE_PATH');
  const release = await new BaselineReleaseReader(workspace).resolvePublishedRelease();
  const bundle = await readEvaluationFile(process.argv[2]!); const report = evaluate(bundle, release);
  const path = await writeEvaluationReport(join(workspace, 'discovery-engine/artifacts/evaluation'), report);
  console.log(JSON.stringify({ result: 'evaluated', report: path, queries: report.overall.queries, scored: report.overall.scored, failures: report.overall.failures, activated: false }));
} catch (error) { console.error(JSON.stringify({ code: error instanceof EvaluationError ? error.code : 'EVALUATION_FAILED' })); process.exitCode = 1; }
