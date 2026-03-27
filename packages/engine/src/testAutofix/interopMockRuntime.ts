import {
  registerRemediationInteropCapability,
  runMockLifelineAdapterCycle
} from './interop.js';

export const runFixtureLifelineRuntime = (repoRoot: string, input?: {
  workerId?: string;
  now?: string;
  failRequestIds?: string[];
  rejectRequestIds?: string[];
}): void => {
  const workerId = input?.workerId ?? 'lifeline-fixture-worker';
  const now = input?.now ?? new Date().toISOString();

  registerRemediationInteropCapability(repoRoot, {
    capabilityId: 'lifeline-remediation-v1',
    workerId,
    actions: ['test-triage', 'test-fix-plan', 'apply-result', 'test-autofix', 'remediation-status'],
    registeredAt: now,
    idempotencyKey: `fixture-capability:${workerId}`
  });

  runMockLifelineAdapterCycle(repoRoot, {
    workerId,
    now,
    failRequestIds: input?.failRequestIds,
    rejectRequestIds: input?.rejectRequestIds
  });
};
