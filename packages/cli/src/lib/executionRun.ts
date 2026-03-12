import {
  appendExecutionStep,
  completeExecutionRun,
  createExecutionRun,
  failExecutionRun,
  listExecutionRuns,
  readExecutionRun,
  writeExecutionRun,
  type VerifyReport
} from '@zachariahredfield/playbook-engine';
import type { ExecutionEvidence, ExecutionRun } from '@zachariahredfield/playbook-core';

const defaultIntent = () => ({
  goal: 'Execute deterministic remediation workflow.',
  scope: ['verify', 'plan', 'apply', 'verify'],
  constraints: ['deterministic', 'cli-owned-artifacts'],
  requested_by: 'system' as const
});

const latestActiveRun = (cwd: string): ExecutionRun | null => {
  const runs = listExecutionRuns(cwd);
  const active = runs.filter((run) => !run.completed_at && !run.outcome);
  return active.length > 0 ? active[active.length - 1] : null;
};

export const resolveExecutionRun = (cwd: string, runId?: string): ExecutionRun => {
  if (runId) {
    return readExecutionRun(cwd, runId);
  }

  return latestActiveRun(cwd) ?? createExecutionRun({ intent: defaultIntent() });
};

export const recordExecutionStep = (cwd: string, run: ExecutionRun, input: {
  kind: 'observe' | 'plan' | 'apply' | 'verify' | 'learn';
  status: 'passed' | 'failed' | 'skipped';
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  evidence?: ExecutionEvidence[];
  finalize?: { status: 'passed' | 'failed' | 'partial'; summary: string; failureCause?: string };
}): ExecutionRun => {
  let next = appendExecutionStep(run, {
    kind: input.kind,
    status: input.status,
    inputs: input.inputs,
    outputs: input.outputs,
    evidence: input.evidence,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  });

  if (input.finalize) {
    if (input.finalize.status === 'failed' && input.finalize.failureCause) {
      next = failExecutionRun(next, input.finalize.failureCause);
    } else {
      next = completeExecutionRun(next, {
        status: input.finalize.status,
        summary: input.finalize.summary,
        failure_cause: input.finalize.failureCause
      });
    }
  }

  writeExecutionRun(cwd, next);
  return next;
};

export const verifyEvidence = (outFile: string | undefined, report: VerifyReport): ExecutionEvidence[] => {
  const evidence: ExecutionEvidence[] = [];
  if (outFile) {
    evidence.push({ id: 'verify-artifact', kind: 'artifact', ref: outFile, summary: 'Verify findings artifact.' });
  }

  report.failures.slice(0, 5).forEach((failure, index) => {
    evidence.push({
      id: `verify-failure-${index + 1}`,
      kind: 'finding',
      ref: failure.id,
      summary: failure.message,
      metadata: { fix: failure.fix }
    });
  });

  return evidence;
};

