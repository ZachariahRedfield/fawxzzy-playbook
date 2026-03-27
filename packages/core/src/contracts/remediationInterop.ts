export const REMEDIATION_INTEROP_SCHEMA_VERSION = '1.0' as const;

export const remediationInteropActionKinds = [
  'test-triage',
  'test-fix-plan',
  'apply-result',
  'test-autofix',
  'remediation-status'
] as const;
export type RemediationInteropActionKind = (typeof remediationInteropActionKinds)[number];

export const remediationInteropExecutionStates = [
  'pending',
  'running',
  'failed',
  'completed',
  'blocked',
  'rejected'
] as const;
export type RemediationInteropExecutionState = (typeof remediationInteropExecutionStates)[number];

export type RemediationInteropCapabilityRegistration = {
  schemaVersion: typeof REMEDIATION_INTEROP_SCHEMA_VERSION;
  kind: 'remediation-interop-capability-registration';
  capabilityId: string;
  workerId: string;
  actions: RemediationInteropActionKind[];
  registeredAt: string;
  idempotencyKey: string;
};

export type RemediationInteropBlockedReason = {
  schemaVersion: typeof REMEDIATION_INTEROP_SCHEMA_VERSION;
  kind: 'remediation-interop-blocked-reason';
  code: 'not-release-ready' | 'capability-missing' | 'explicit-rejection' | 'runtime-error';
  message: string;
  details?: Record<string, unknown>;
};

export type RemediationInteropActionRequest = {
  schemaVersion: typeof REMEDIATION_INTEROP_SCHEMA_VERSION;
  kind: 'remediation-interop-action-request';
  requestId: string;
  remediationId: string;
  action: RemediationInteropActionKind;
  requestedAt: string;
  requestedBy: 'playbook';
  rendezvousManifestPath: string;
  rendezvousBaseSha: string;
  releaseReady: true;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  state: RemediationInteropExecutionState;
  blockedReason?: RemediationInteropBlockedReason;
  retries: number;
};

export type RemediationInteropActionStatus = {
  schemaVersion: typeof REMEDIATION_INTEROP_SCHEMA_VERSION;
  kind: 'remediation-interop-action-status';
  requestId: string;
  state: RemediationInteropExecutionState;
  updatedAt: string;
  workerId?: string;
  blockedReason?: RemediationInteropBlockedReason;
};

export type RemediationInteropExecutionReceipt = {
  schemaVersion: typeof REMEDIATION_INTEROP_SCHEMA_VERSION;
  kind: 'remediation-interop-execution-receipt';
  receiptId: string;
  requestId: string;
  remediationId: string;
  action: RemediationInteropActionKind;
  status: 'completed' | 'failed' | 'blocked' | 'rejected';
  createdAt: string;
  workerId: string;
  output: Record<string, unknown>;
  blockedReason?: RemediationInteropBlockedReason;
};

export type RemediationInteropHealthSnapshot = {
  schemaVersion: typeof REMEDIATION_INTEROP_SCHEMA_VERSION;
  kind: 'remediation-interop-heartbeat';
  workerId: string;
  heartbeatAt: string;
  status: 'healthy' | 'degraded' | 'offline';
  queueDepth: number;
  lastReceiptId?: string;
};

export type RemediationInteropRetryReconcileState = {
  schemaVersion: typeof REMEDIATION_INTEROP_SCHEMA_VERSION;
  kind: 'remediation-interop-retry-reconcile-state';
  generatedAt: string;
  pending: string[];
  running: string[];
  failed: string[];
  completed: string[];
  blocked: string[];
  rejected: string[];
};

export type RemediationInteropStore = {
  schemaVersion: typeof REMEDIATION_INTEROP_SCHEMA_VERSION;
  kind: 'remediation-interop-store';
  capabilities: RemediationInteropCapabilityRegistration[];
  requests: RemediationInteropActionRequest[];
  receipts: RemediationInteropExecutionReceipt[];
  health: RemediationInteropHealthSnapshot[];
  reconcile: RemediationInteropRetryReconcileState;
};
