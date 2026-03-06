import { analyze, formatAnalyzeCi, formatAnalyzeHuman } from '@zachariahredfield/playbook-core';
import { generateRepositoryIndex } from '@zachariahredfield/playbook-engine';
import { createNodeContext } from '@zachariahredfield/playbook-node';
import fs from 'node:fs';
import path from 'node:path';
import { emitResult, ExitCode } from '../lib/cliContract.js';
import { loadAnalyzeRules } from '../lib/loadAnalyzeRules.js';

export type AnalyzeReport = Awaited<ReturnType<typeof analyze>>;
type AnalyzeRecommendation = AnalyzeReport['recommendations'][number];

type AnalyzeOptions = {
  ci: boolean;
  explain: boolean;
  format: 'text' | 'json';
  quiet: boolean;
};

const repoIndexPathForRoot = (repoRoot: string): string => path.join(repoRoot, '.playbook', 'repo-index.json');

const writeRepoIndex = async (repoRoot: string): Promise<string> => {
  const outPath = repoIndexPathForRoot(repoRoot);
  const payload = generateRepositoryIndex(repoRoot);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outPath;
};

export const ensureRepoIndex = async (repoRoot: string): Promise<string> => {
  const outPath = repoIndexPathForRoot(repoRoot);
  if (fs.existsSync(outPath)) {
    return outPath;
  }

  return await writeRepoIndex(repoRoot);
};

const resolveRecommendationGuidance = (
  analyzeRules: Awaited<ReturnType<typeof loadAnalyzeRules>>,
  recommendation: AnalyzeRecommendation
): { explanation?: string; remediation?: string[] } => {
  const rule = analyzeRules.find((candidate) => candidate.check({ recommendation }));
  return {
    explanation: rule?.explanation ?? recommendation.why,
    remediation: rule?.remediation ?? [recommendation.fix]
  };
};

export const collectAnalyzeReport = async (cwd: string): Promise<AnalyzeReport> => analyze(await createNodeContext({ cwd }));

export const runAnalyze = async (cwd: string, opts: AnalyzeOptions): Promise<number> => {
  const ctx = await createNodeContext({ cwd });
  const result = await analyze(ctx);
  const analyzeRules = await loadAnalyzeRules();
  const repoIndexPath = await writeRepoIndex(ctx.repoRoot);

  if (opts.format === 'text' && !opts.ci) {
    if (!opts.explain) {
      console.log(formatAnalyzeHuman(result));
      console.log(`\nRepository index written: ${path.relative(cwd, repoIndexPath)}`);
      return ExitCode.Success;
    }
  }

  if (opts.format === 'text' && opts.ci && !opts.explain) {
    if (!opts.quiet || !result.ok) {
      console.log(formatAnalyzeCi(result));
      if (!opts.quiet) {
        console.log(`Repository index written: ${path.relative(cwd, repoIndexPath)}`);
      }
    }
    return result.ok ? ExitCode.Success : ExitCode.Failure;
  }

  emitResult({
    format: opts.format,
    quiet: opts.quiet,
    explain: opts.explain,
    command: 'analyze',
    ok: result.ok,
    exitCode: result.ok ? ExitCode.Success : ExitCode.Failure,
    summary: result.ok ? 'Analyze completed successfully.' : 'Analyze completed with findings.',
    findings: result.recommendations.map((rec: AnalyzeRecommendation) => ({
      ...resolveRecommendationGuidance(analyzeRules, rec),
      id: `analyze.recommendation.${rec.id}`,
      level: rec.severity === 'WARN' ? 'warning' as const : 'info' as const,
      message: rec.message
    })),
    nextActions: [...result.recommendations.map((rec: AnalyzeRecommendation) => rec.fix), `Review ${path.relative(cwd, repoIndexPath)} for architecture index consumers.`]
  });

  return result.ok ? ExitCode.Success : ExitCode.Failure;
};
