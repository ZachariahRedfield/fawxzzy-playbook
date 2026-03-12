export type ExecutionIntent = {
  id: string;
  goal: string;
  scope: string[];
  constraints: string[];
  requested_by: 'user' | 'system';
};

export type ExecutionEvidence = {
  id: string;
  kind: 'artifact' | 'finding' | 'plan-task' | 'note';
  ref: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type ExecutionCheckpoint = {
  id: string;
  step_id: string;
  label: string;
  status: 'passed' | 'failed' | 'skipped';
  created_at: string;
};

export type ExecutionStep = {
  id: string;
  kind: 'observe' | 'plan' | 'apply' | 'verify' | 'learn';
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  evidence: ExecutionEvidence[];
  started_at?: string;
  completed_at?: string;
};

export type ExecutionOutcome = {
  status: 'passed' | 'failed' | 'partial';
  summary: string;
  failure_cause?: string;
};

export type ExecutionRun = {
  id: string;
  version: 1;
  intent: ExecutionIntent;
  steps: ExecutionStep[];
  checkpoints: ExecutionCheckpoint[];
  created_at: string;
  completed_at?: string;
  outcome?: ExecutionOutcome;
};
