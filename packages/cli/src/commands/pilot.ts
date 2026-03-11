import fs from 'node:fs';
import path from 'node:path';
import { generatePlanContract, queryRepositoryIndex } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { writeJsonArtifact } from '../lib/jsonArtifact.js';
import { resolveTargetRepoRoot } from '../lib/repoRoot.js';
import { runContext } from './context.js';
import { runIndex } from './repoIndex.js';
import { runQuery } from './query.js';
import { collectVerifyReport } from './verify.js';
import { buildPlanRemediation, deriveVerifyFailureFacts } from '../lib/remediationContract.js';

type PilotOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

type PilotSummary = {
  schemaVersion: '1.0';
  command: 'pilot';
  targetRepo: string;
  frameworkInference: string;
  architectureInference: string;
  modulesDetectedCount: number;
  verifyWarningsCount: number;
  verifyFailuresCount: number;
  remediationStatus: string;
  artifactPathsWritten: {
    findings: string;
    plan: string;
    summary: string;
  };
};

const parseOptionValue = (allArgs: string[], name: string): string | undefined => {
  const index = allArgs.indexOf(name);
  return index >= 0 && allArgs[index + 1] ? String(allArgs[index + 1]) : undefined;
};

const toRelative = (repoRoot: string, absolutePath: string): string => path.relative(repoRoot, absolutePath).split(path.sep).join(path.posix.sep);

const summarize = (summary: PilotSummary): void => {
  console.log('Playbook Pilot');
  console.log('─────────────');
  console.log(`Target repo: ${summary.targetRepo}`);
  console.log(`Framework: ${summary.frameworkInference}`);
  console.log(`Architecture: ${summary.architectureInference}`);
  console.log(`Modules detected: ${summary.modulesDetectedCount}`);
  console.log(`Verify warnings: ${summary.verifyWarningsCount}`);
  console.log(`Verify failures: ${summary.verifyFailuresCount}`);
  console.log(`Remediation status: ${summary.remediationStatus}`);
  console.log('Artifacts written:');
  console.log(`- ${summary.artifactPathsWritten.findings}`);
  console.log(`- ${summary.artifactPathsWritten.plan}`);
  console.log(`- ${summary.artifactPathsWritten.summary}`);
};

export const runPilot = async (cwd: string, commandArgs: string[], options: PilotOptions): Promise<number> => {
  const repoArg = parseOptionValue(commandArgs, '--repo');
  if (!repoArg) {
    console.error('playbook pilot: missing required --repo <target-repo-path> option');
    return ExitCode.Failure;
  }

  const targetRepo = resolveTargetRepoRoot(cwd, repoArg);
  const playbookDir = path.join(targetRepo, '.playbook');
  fs.mkdirSync(playbookDir, { recursive: true });

  await runContext(targetRepo, { format: 'text', quiet: true });
  await runIndex(targetRepo, { format: 'text', quiet: true });
  await runQuery(targetRepo, ['modules'], { format: 'text', quiet: true });

  const modules = queryRepositoryIndex(targetRepo, 'modules');
  const verifyReport = await collectVerifyReport(targetRepo);
  const plan = generatePlanContract(targetRepo);
  const failureFacts = deriveVerifyFailureFacts(plan.verify);
  const remediation = buildPlanRemediation({ failureCount: failureFacts.failureCount, stepCount: plan.tasks.length });

  const findingsPayload = {
    schemaVersion: '1.0',
    command: 'verify',
    ok: verifyReport.ok,
    exitCode: verifyReport.ok ? ExitCode.Success : ExitCode.PolicyFailure,
    summary: verifyReport.ok ? 'Verification passed.' : 'Verification failed.',
    findings: [
      ...verifyReport.failures.map((failure) => ({ id: `verify.failure.${failure.id}`, level: 'error' as const, message: failure.message })),
      ...verifyReport.warnings.map((warning) => ({ id: `verify.warning.${warning.id}`, level: 'warning' as const, message: warning.message }))
    ],
    nextActions: verifyReport.failures.map((failure) => failure.fix).filter((fix): fix is string => Boolean(fix))
  };

  const planPayload = {
    schemaVersion: '1.0',
    command: 'plan',
    ok: true,
    exitCode: ExitCode.Success,
    verify: plan.verify,
    remediation,
    tasks: plan.tasks
  };

  const findingsPath = writeJsonArtifact(targetRepo, '.playbook/findings.json', findingsPayload, 'pilot');
  const planPath = writeJsonArtifact(targetRepo, '.playbook/plan.json', planPayload, 'pilot');

  const repoIndex = JSON.parse(fs.readFileSync(path.join(targetRepo, '.playbook', 'repo-index.json'), 'utf8')) as {
    framework?: string;
    architecture?: string;
  };

  const summary: PilotSummary = {
    schemaVersion: '1.0',
    command: 'pilot',
    targetRepo,
    frameworkInference: repoIndex.framework ?? 'unknown',
    architectureInference: repoIndex.architecture ?? 'unknown',
    modulesDetectedCount: Array.isArray(modules) ? modules.length : 0,
    verifyWarningsCount: verifyReport.summary.warnings,
    verifyFailuresCount: verifyReport.summary.failures,
    remediationStatus: remediation.status,
    artifactPathsWritten: {
      findings: toRelative(targetRepo, findingsPath),
      plan: toRelative(targetRepo, planPath),
      summary: '.playbook/pilot-summary.json'
    }
  };

  writeJsonArtifact(targetRepo, '.playbook/pilot-summary.json', summary, 'pilot');

  if (options.format === 'json') {
    console.log(JSON.stringify(summary, null, 2));
    return ExitCode.Success;
  }

  if (!options.quiet) {
    summarize(summary);
  }

  return ExitCode.Success;
};
