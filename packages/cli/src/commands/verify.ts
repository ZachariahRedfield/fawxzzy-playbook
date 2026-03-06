import { formatHuman, verifyRepo } from '@zachariahredfield/playbook-engine';
import { emitResult, ExitCode } from '../lib/cliContract.js';
import { loadVerifyRules } from '../lib/loadVerifyRules.js';

export type VerifyReport = ReturnType<typeof verifyRepo>;
type VerifyFailure = VerifyReport['failures'][number];
type VerifyWarning = VerifyReport['warnings'][number];

const resolveFailureGuidance = (
  verifyRules: Awaited<ReturnType<typeof loadVerifyRules>>,
  failure: VerifyFailure
): { explanation?: string; remediation?: string[] } => {
  const rule = verifyRules.find((candidate) => candidate.check({ failure }));
  return {
    explanation: rule?.explanation,
    remediation: rule?.remediation ?? (failure.fix ? [failure.fix] : undefined)
  };
};

export const collectVerifyReport = async (cwd: string): Promise<VerifyReport> => verifyRepo(cwd);

export const runVerify = async (
  cwd: string,
  options: { format: 'text' | 'json'; ci: boolean; quiet: boolean; explain: boolean }
): Promise<number> => {
  const verifyRules = await loadVerifyRules(cwd);
  const report = await collectVerifyReport(cwd);

  if (options.format === 'text' && !options.ci && !options.explain) {
    console.log(formatHuman(report));
    return report.ok ? ExitCode.Success : ExitCode.PolicyFailure;
  }

  if (options.format === 'text' && options.ci && !options.explain) {
    if (!options.quiet || !report.ok) {
      console.log(report.ok ? 'playbook verify: PASS' : 'playbook verify: FAIL');
    }
    return report.ok ? ExitCode.Success : ExitCode.PolicyFailure;
  }

  emitResult({
    format: options.format,
    quiet: options.quiet,
    explain: options.explain,
    command: 'verify',
    ok: report.ok,
    exitCode: report.ok ? ExitCode.Success : ExitCode.PolicyFailure,
    summary: report.ok ? 'Verification passed.' : 'Verification failed.',
    findings: [
      ...report.failures.map((failure: VerifyFailure) => ({
        ...resolveFailureGuidance(verifyRules, failure),
        id: `verify.failure.${failure.id}`,
        level: 'error' as const,
        message: failure.message
      })),
      ...report.warnings.map((warning: VerifyWarning) => ({
        id: `verify.warning.${warning.id}`,
        level: 'warning' as const,
        message: warning.message
      }))
    ],
    nextActions: report.failures
      .map((failure: VerifyFailure) => failure.fix)
      .filter((fix: string | undefined): fix is string => Boolean(fix))
  });

  return report.ok ? ExitCode.Success : ExitCode.PolicyFailure;
};
