import type {
  ExecutionCheckpoint,
  ExecutionEvidence,
  ExecutionOutcome,
  ExecutionRun,
  ExecutionStep
} from '@zachariahredfield/playbook-core';

type AppendStepInput = {
  kind: ExecutionStep['kind'];
  status: ExecutionStep['status'];
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  evidence?: ExecutionEvidence[];
  startedAt?: string;
  completedAt?: string;
};

const assertMutable = (run: ExecutionRun): void => {
  if (run.completed_at || run.outcome) {
    throw new Error(`Execution run ${run.id} is completed and cannot be modified.`);
  }
};

const nextStepId = (run: ExecutionRun, kind: ExecutionStep['kind']): string => `${kind}-${String(run.steps.length + 1).padStart(3, '0')}`;

const toCheckpoint = (step: ExecutionStep): ExecutionCheckpoint => ({
  id: `checkpoint-${step.id}`,
  step_id: step.id,
  label: `${step.kind}:${step.status}`,
  status: step.status === 'passed' ? 'passed' : step.status === 'skipped' ? 'skipped' : 'failed',
  created_at: step.completed_at ?? step.started_at ?? new Date().toISOString()
});

export const appendExecutionStep = (run: ExecutionRun, input: AppendStepInput): ExecutionRun => {
  assertMutable(run);
  const step: ExecutionStep = {
    id: nextStepId(run, input.kind),
    kind: input.kind,
    status: input.status,
    inputs: input.inputs ?? {},
    outputs: input.outputs ?? {},
    evidence: input.evidence ?? [],
    started_at: input.startedAt,
    completed_at: input.completedAt
  };

  const checkpoints = ['passed', 'failed', 'skipped'].includes(step.status) ? [...run.checkpoints, toCheckpoint(step)] : run.checkpoints;

  return {
    ...run,
    steps: [...run.steps, step],
    checkpoints
  };
};

export const completeExecutionRun = (run: ExecutionRun, outcome: ExecutionOutcome, completedAt?: string): ExecutionRun => {
  assertMutable(run);
  return {
    ...run,
    outcome,
    completed_at: completedAt ?? new Date().toISOString()
  };
};

export const failExecutionRun = (run: ExecutionRun, failureCause: string, completedAt?: string): ExecutionRun =>
  completeExecutionRun(
    run,
    {
      status: 'failed',
      summary: 'Execution run failed.',
      failure_cause: failureCause
    },
    completedAt
  );

