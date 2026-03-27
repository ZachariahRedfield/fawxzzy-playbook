import path from 'node:path';
import type {
  RemediationInteropActionKind,
  RemediationInteropActionRequest,
  RemediationInteropActionStatus,
  RemediationInteropBlockedReason,
  RemediationInteropCapabilityRegistration,
  RemediationInteropExecutionReceipt,
  RemediationInteropHealthSnapshot,
  RemediationInteropRetryReconcileState,
  RemediationInteropStore,
  RendezvousManifest,
  RendezvousManifestEvaluation
} from '@zachariahredfield/playbook-core';
import {
  REMEDIATION_INTEROP_SCHEMA_VERSION,
  remediationInteropActionKinds,
  remediationInteropExecutionStates
} from '@zachariahredfield/playbook-core';
import { readJsonIfExists, writeDeterministicJsonAtomic } from '../learning/io.js';

export const REMEDIATION_INTEROP_STORE_RELATIVE_PATH = '.playbook/remediation-interop-store.json' as const;

const createBlockedReason = (input: {
  code: RemediationInteropBlockedReason['code'];
  message: string;
  details?: Record<string, unknown>;
}): RemediationInteropBlockedReason => ({
  schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
  kind: 'remediation-interop-blocked-reason',
  code: input.code,
  message: input.message,
  ...(input.details ? { details: input.details } : {})
});

const emptyReconcile = (): RemediationInteropRetryReconcileState => ({
  schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
  kind: 'remediation-interop-retry-reconcile-state',
  generatedAt: '1970-01-01T00:00:00.000Z',
  pending: [],
  running: [],
  failed: [],
  completed: [],
  blocked: [],
  rejected: []
});

export const createEmptyRemediationInteropStore = (): RemediationInteropStore => ({
  schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
  kind: 'remediation-interop-store',
  capabilities: [],
  requests: [],
  receipts: [],
  health: [],
  reconcile: emptyReconcile()
});

const sortUnique = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const sortById = <T>(values: T[], getId: (value: T) => string): T[] => [...values].sort((a, b) => getId(a).localeCompare(getId(b)));

const normalizeStore = (raw?: Partial<RemediationInteropStore>): RemediationInteropStore => {
  const base = raw ?? {};

  return {
    schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
    kind: 'remediation-interop-store',
    capabilities: sortById(base.capabilities ?? [], (entry) => `${entry.capabilityId}:${entry.workerId}:${entry.idempotencyKey}`),
    requests: sortById(base.requests ?? [], (entry) => entry.requestId),
    receipts: sortById(base.receipts ?? [], (entry) => entry.receiptId),
    health: sortById(base.health ?? [], (entry) => `${entry.workerId}:${entry.heartbeatAt}`),
    reconcile: {
      schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
      kind: 'remediation-interop-retry-reconcile-state',
      generatedAt: base.reconcile?.generatedAt ?? '1970-01-01T00:00:00.000Z',
      pending: sortUnique(base.reconcile?.pending ?? []),
      running: sortUnique(base.reconcile?.running ?? []),
      failed: sortUnique(base.reconcile?.failed ?? []),
      completed: sortUnique(base.reconcile?.completed ?? []),
      blocked: sortUnique(base.reconcile?.blocked ?? []),
      rejected: sortUnique(base.reconcile?.rejected ?? [])
    }
  };
};

export const readRemediationInteropStore = (repoRoot: string): RemediationInteropStore =>
  normalizeStore(readJsonIfExists<RemediationInteropStore>(path.join(repoRoot, REMEDIATION_INTEROP_STORE_RELATIVE_PATH)));

export const writeRemediationInteropStore = (repoRoot: string, store: RemediationInteropStore): void => {
  writeDeterministicJsonAtomic(path.join(repoRoot, REMEDIATION_INTEROP_STORE_RELATIVE_PATH), normalizeStore(store));
};

export const registerRemediationInteropCapability = (
  repoRoot: string,
  input: Omit<RemediationInteropCapabilityRegistration, 'schemaVersion' | 'kind'>
): RemediationInteropStore => {
  const store = readRemediationInteropStore(repoRoot);
  const actions = sortUnique(input.actions.filter((entry): entry is RemediationInteropActionKind => remediationInteropActionKinds.includes(entry))) as RemediationInteropActionKind[];
  const registration: RemediationInteropCapabilityRegistration = {
    schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
    kind: 'remediation-interop-capability-registration',
    ...input,
    actions
  };

  const existingIndex = store.capabilities.findIndex(
    (entry) => entry.capabilityId === registration.capabilityId && entry.workerId === registration.workerId
  );

  if (existingIndex >= 0) {
    store.capabilities[existingIndex] = registration;
  } else {
    store.capabilities.push(registration);
  }

  const normalized = normalizeStore(store);
  writeRemediationInteropStore(repoRoot, normalized);
  return normalized;
};

const hasActionCapability = (store: RemediationInteropStore, action: RemediationInteropActionKind): boolean =>
  store.capabilities.some((entry) => entry.actions.includes(action));

export const emitBoundedInteropActionRequest = (repoRoot: string, input: {
  requestId: string;
  action: RemediationInteropActionKind;
  manifest: RendezvousManifest;
  evaluation: RendezvousManifestEvaluation;
  payload?: Record<string, unknown>;
  requestedAt: string;
  idempotencyKey: string;
}): { store: RemediationInteropStore; request?: RemediationInteropActionRequest; status: RemediationInteropActionStatus } => {
  const store = readRemediationInteropStore(repoRoot);

  if (!input.evaluation.releaseReady) {
    const blocked = createBlockedReason({
      code: 'not-release-ready',
      message: 'rendezvous release gate is not ready; bounded request emission is blocked',
      details: {
        state: input.evaluation.state,
        blockers: input.evaluation.blockers
      }
    });

    const status: RemediationInteropActionStatus = {
      schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
      kind: 'remediation-interop-action-status',
      requestId: input.requestId,
      state: 'blocked',
      updatedAt: input.requestedAt,
      blockedReason: blocked
    };

    return { store, status };
  }

  if (!hasActionCapability(store, input.action)) {
    const blocked = createBlockedReason({
      code: 'capability-missing',
      message: `no registered capability supports action ${input.action}`
    });

    const request: RemediationInteropActionRequest = {
      schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
      kind: 'remediation-interop-action-request',
      requestId: input.requestId,
      remediationId: input.manifest.remediationId,
      action: input.action,
      requestedAt: input.requestedAt,
      requestedBy: 'playbook',
      rendezvousManifestPath: '.playbook/rendezvous-manifest.json',
      rendezvousBaseSha: input.manifest.baseSha,
      releaseReady: true,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload ?? {},
      state: 'blocked',
      blockedReason: blocked,
      retries: 0
    };

    store.requests.push(request);
    const normalized = normalizeStore(store);
    writeRemediationInteropStore(repoRoot, normalized);

    return {
      store: normalized,
      request,
      status: {
        schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
        kind: 'remediation-interop-action-status',
        requestId: request.requestId,
        state: request.state,
        updatedAt: request.requestedAt,
        blockedReason: blocked
      }
    };
  }

  const existing = store.requests.find((entry) => entry.idempotencyKey === input.idempotencyKey && entry.action === input.action);
  if (existing) {
    return {
      store,
      request: existing,
      status: {
        schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
        kind: 'remediation-interop-action-status',
        requestId: existing.requestId,
        state: existing.state,
        updatedAt: input.requestedAt,
        blockedReason: existing.blockedReason
      }
    };
  }

  const request: RemediationInteropActionRequest = {
    schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
    kind: 'remediation-interop-action-request',
    requestId: input.requestId,
    remediationId: input.manifest.remediationId,
    action: input.action,
    requestedAt: input.requestedAt,
    requestedBy: 'playbook',
    rendezvousManifestPath: '.playbook/rendezvous-manifest.json',
    rendezvousBaseSha: input.manifest.baseSha,
    releaseReady: true,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload ?? {},
    state: 'pending',
    retries: 0
  };

  store.requests.push(request);
  const normalized = normalizeStore(store);
  writeRemediationInteropStore(repoRoot, normalized);

  return {
    store: normalized,
    request,
    status: {
      schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
      kind: 'remediation-interop-action-status',
      requestId: request.requestId,
      state: request.state,
      updatedAt: request.requestedAt
    }
  };
};

export const runMockLifelineAdapterCycle = (repoRoot: string, input: {
  workerId: string;
  now: string;
  failRequestIds?: string[];
  rejectRequestIds?: string[];
}): RemediationInteropStore => {
  const store = readRemediationInteropStore(repoRoot);
  const failSet = new Set(input.failRequestIds ?? []);
  const rejectSet = new Set(input.rejectRequestIds ?? []);

  for (const request of store.requests) {
    const existingReceipt = store.receipts.find((entry) => entry.requestId === request.requestId);
    if (existingReceipt || request.state !== 'pending') {
      continue;
    }

    request.state = 'running';

    if (rejectSet.has(request.requestId)) {
      const blockedReason = createBlockedReason({
        code: 'explicit-rejection',
        message: 'lifeline adapter rejected execution for this request'
      });
      request.state = 'rejected';
      request.blockedReason = blockedReason;
      store.receipts.push({
        schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
        kind: 'remediation-interop-execution-receipt',
        receiptId: `receipt:${request.requestId}`,
        requestId: request.requestId,
        remediationId: request.remediationId,
        action: request.action,
        status: 'rejected',
        createdAt: input.now,
        workerId: input.workerId,
        output: { rejected: true, reason: blockedReason.message },
        blockedReason
      });
      continue;
    }

    if (failSet.has(request.requestId)) {
      request.state = 'failed';
      request.retries += 1;
      store.receipts.push({
        schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
        kind: 'remediation-interop-execution-receipt',
        receiptId: `receipt:${request.requestId}`,
        requestId: request.requestId,
        remediationId: request.remediationId,
        action: request.action,
        status: 'failed',
        createdAt: input.now,
        workerId: input.workerId,
        output: { failed: true, retries: request.retries }
      });
      continue;
    }

    request.state = 'completed';
    store.receipts.push({
      schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
      kind: 'remediation-interop-execution-receipt',
      receiptId: `receipt:${request.requestId}`,
      requestId: request.requestId,
      remediationId: request.remediationId,
      action: request.action,
      status: 'completed',
      createdAt: input.now,
      workerId: input.workerId,
      output: { completed: true }
    });
  }

  const latestReceiptId = sortById(store.receipts, (entry) => entry.createdAt).at(-1)?.receiptId;
  const heartbeat: RemediationInteropHealthSnapshot = {
    schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
    kind: 'remediation-interop-heartbeat',
    workerId: input.workerId,
    heartbeatAt: input.now,
    status: 'healthy',
    queueDepth: store.requests.filter((entry) => entry.state === 'pending' || entry.state === 'running').length,
    ...(latestReceiptId ? { lastReceiptId: latestReceiptId } : {})
  };
  store.health.push(heartbeat);

  const normalized = reconcileRemediationInteropState(store, input.now);
  writeRemediationInteropStore(repoRoot, normalized);
  return normalized;
};

export const reconcileRemediationInteropState = (
  store: RemediationInteropStore,
  generatedAt: string
): RemediationInteropStore => {
  const next = normalizeStore(store);
  const buckets: Record<typeof remediationInteropExecutionStates[number], string[]> = {
    pending: [],
    running: [],
    failed: [],
    completed: [],
    blocked: [],
    rejected: []
  };

  for (const request of next.requests) {
    buckets[request.state].push(request.requestId);
  }

  next.reconcile = {
    schemaVersion: REMEDIATION_INTEROP_SCHEMA_VERSION,
    kind: 'remediation-interop-retry-reconcile-state',
    generatedAt,
    pending: sortUnique(buckets.pending),
    running: sortUnique(buckets.running),
    failed: sortUnique(buckets.failed),
    completed: sortUnique(buckets.completed),
    blocked: sortUnique(buckets.blocked),
    rejected: sortUnique(buckets.rejected)
  };

  return next;
};

export const inspectRemediationInterop = (repoRoot: string): {
  capabilities: RemediationInteropCapabilityRegistration[];
  requests: RemediationInteropActionRequest[];
  latestReceipts: RemediationInteropExecutionReceipt[];
  heartbeat: RemediationInteropHealthSnapshot | null;
  reconcile: RemediationInteropRetryReconcileState;
} => {
  const store = readRemediationInteropStore(repoRoot);
  const latestByRequest = new Map<string, RemediationInteropExecutionReceipt>();
  for (const receipt of sortById(store.receipts, (entry) => entry.createdAt)) {
    latestByRequest.set(receipt.requestId, receipt);
  }

  const latestHeartbeat = sortById(store.health, (entry) => entry.heartbeatAt).at(-1) ?? null;
  return {
    capabilities: store.capabilities,
    requests: store.requests,
    latestReceipts: sortById([...latestByRequest.values()], (entry) => entry.requestId),
    heartbeat: latestHeartbeat,
    reconcile: store.reconcile
  };
};
