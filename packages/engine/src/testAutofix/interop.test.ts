import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createEmptyRemediationInteropStore,
  emitBoundedInteropActionRequest,
  inspectRemediationInterop,
  readRemediationInteropStore,
  registerRemediationInteropCapability,
  reconcileRemediationInteropState,
  runMockLifelineAdapterCycle,
  writeRemediationInteropStore
} from './interop.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-interop-'));

const readyManifest = {
  schemaVersion: '1.0' as const,
  kind: 'artifact-rendezvous-manifest' as const,
  generatedAt: '2026-01-01T00:00:00.000Z',
  baseSha: 'abc123',
  remediationId: 'run-1:sig-a',
  requiredArtifactIds: ['failure-log', 'test-triage', 'test-fix-plan', 'apply-result', 'test-autofix', 'remediation-status'] as const,
  artifacts: {
    'failure-log': { artifactId: 'failure-log', path: '.playbook/ci-failure.log', sha256: 'a', verification: 'passed' },
    'test-triage': { artifactId: 'test-triage', path: '.playbook/test-triage.json', sha256: 'b', verification: 'passed' },
    'test-fix-plan': { artifactId: 'test-fix-plan', path: '.playbook/test-fix-plan.json', sha256: 'c', verification: 'passed' },
    'apply-result': { artifactId: 'apply-result', path: '.playbook/test-autofix-apply.json', sha256: 'd', verification: 'passed' },
    'test-autofix': { artifactId: 'test-autofix', path: '.playbook/test-autofix.json', sha256: 'e', verification: 'passed' },
    'remediation-status': { artifactId: 'remediation-status', path: '.playbook/remediation-status.json', sha256: 'f', verification: 'passed' }
  },
  blockers: [],
  confidence: 1,
  staleOnShaChange: true
};

const readyEvaluation = {
  state: 'complete' as const,
  releaseReady: true,
  blockers: [],
  missingArtifactIds: [],
  conflictingArtifactIds: [],
  stale: false
};

describe('remediation interop contracts', () => {
  it('registers capabilities, emits requests from release-ready rendezvous, persists receipts/heartbeat, and reconciles across restart', () => {
    const repo = createRepo();

    registerRemediationInteropCapability(repo, {
      capabilityId: 'lifeline-remediation-v1',
      workerId: 'lifeline-mock-1',
      actions: ['test-triage', 'test-fix-plan', 'apply-result', 'test-autofix', 'remediation-status'],
      registeredAt: '2026-01-01T00:00:01.000Z',
      idempotencyKey: 'cap:v1'
    });

    const emitted = emitBoundedInteropActionRequest(repo, {
      requestId: 'req-1',
      action: 'test-autofix',
      manifest: readyManifest,
      evaluation: readyEvaluation,
      requestedAt: '2026-01-01T00:00:02.000Z',
      idempotencyKey: 'req:v1'
    });

    expect(emitted.request?.state).toBe('pending');

    const cycled = runMockLifelineAdapterCycle(repo, {
      workerId: 'lifeline-mock-1',
      now: '2026-01-01T00:00:03.000Z'
    });

    expect(cycled.requests.find((entry) => entry.requestId === 'req-1')?.state).toBe('completed');
    expect(cycled.receipts.some((entry) => entry.requestId === 'req-1')).toBe(true);
    expect(cycled.health.length).toBeGreaterThan(0);

    const restartedStore = readRemediationInteropStore(repo);
    const reconciled = reconcileRemediationInteropState(restartedStore, '2026-01-01T00:00:04.000Z');
    writeRemediationInteropStore(repo, reconciled);

    const inspected = inspectRemediationInterop(repo);
    expect(inspected.requests.length).toBe(1);
    expect(inspected.latestReceipts.length).toBe(1);
    expect(inspected.heartbeat?.workerId).toBe('lifeline-mock-1');
    expect(inspected.reconcile.completed).toContain('req-1');
  });

  it('blocks bounded request emission when rendezvous is not release-ready and captures explicit blocked/rejected states', () => {
    const repo = createRepo();

    registerRemediationInteropCapability(repo, {
      capabilityId: 'lifeline-remediation-v1',
      workerId: 'lifeline-mock-1',
      actions: ['test-autofix'],
      registeredAt: '2026-01-01T00:01:01.000Z',
      idempotencyKey: 'cap:v1'
    });

    const blocked = emitBoundedInteropActionRequest(repo, {
      requestId: 'req-blocked',
      action: 'test-autofix',
      manifest: readyManifest,
      evaluation: { ...readyEvaluation, releaseReady: false, state: 'incomplete', blockers: ['missing test-fix-plan'] },
      requestedAt: '2026-01-01T00:01:02.000Z',
      idempotencyKey: 'req:blocked'
    });

    expect(blocked.request).toBeUndefined();
    expect(blocked.status.state).toBe('blocked');
    expect(blocked.status.blockedReason?.code).toBe('not-release-ready');

    emitBoundedInteropActionRequest(repo, {
      requestId: 'req-rejected',
      action: 'test-autofix',
      manifest: readyManifest,
      evaluation: readyEvaluation,
      requestedAt: '2026-01-01T00:01:03.000Z',
      idempotencyKey: 'req:rejected'
    });

    runMockLifelineAdapterCycle(repo, {
      workerId: 'lifeline-mock-1',
      now: '2026-01-01T00:01:04.000Z',
      rejectRequestIds: ['req-rejected']
    });

    const store = readRemediationInteropStore(repo);
    expect(store.requests.find((entry) => entry.requestId === 'req-rejected')?.state).toBe('rejected');
    expect(store.receipts.find((entry) => entry.requestId === 'req-rejected')?.status).toBe('rejected');
    expect(store.reconcile.rejected).toContain('req-rejected');
  });

  it('keeps durable store contract shape stable', () => {
    const store = createEmptyRemediationInteropStore();
    expect(store.kind).toBe('remediation-interop-store');
    expect(store.reconcile.pending).toEqual([]);
  });
});
