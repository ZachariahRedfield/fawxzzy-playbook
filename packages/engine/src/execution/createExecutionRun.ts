import { createHash } from 'node:crypto';
import type { ExecutionIntent, ExecutionRun } from '@zachariahredfield/playbook-core';

const RUN_VERSION = 1 as const;

const createDeterministicIntentId = (intent: Omit<ExecutionIntent, 'id'>): string =>
  `intent-${createHash('sha256').update(JSON.stringify(intent), 'utf8').digest('hex').slice(0, 12)}`;

const createRunId = (intent: Omit<ExecutionIntent, 'id'>, createdAt: string): string =>
  `run-${createHash('sha256').update(`${JSON.stringify(intent)}:${createdAt}`, 'utf8').digest('hex').slice(0, 12)}`;

export const createExecutionRun = (input: {
  intent: Omit<ExecutionIntent, 'id'> & { id?: string };
  createdAt?: string;
}): ExecutionRun => {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const intent: ExecutionIntent = {
    ...input.intent,
    id: input.intent.id ?? createDeterministicIntentId(input.intent)
  };

  return {
    id: createRunId(input.intent, createdAt),
    version: RUN_VERSION,
    intent,
    steps: [],
    checkpoints: [],
    created_at: createdAt
  };
};

