import type { FleetAdoptionReadinessSummary } from './fleetReadiness.js';
import type { FleetCodexExecutionPlan } from './executionPlan.js';
import type { FleetExecutionReceipt, ExecutionComparisonStatus } from './executionReceipt.js';
import type { FleetAdoptionWorkQueue } from './workQueue.js';
import type { ReadinessLifecycleStage } from './readiness.js';

export type ReconciliationStatus =
  | 'completed_as_planned'
  | 'completed_with_drift'
  | 'partial'
  | 'failed'
  | 'blocked'
  | 'not_run'
  | 'retry_required'
  | 'stale_plan_or_superseded';

export type ReconciledRepoState = {
  repo_id: string;
  prior_lifecycle_stage: ReadinessLifecycleStage;
  planned_lifecycle_stage: ReadinessLifecycleStage | null;
  updated_lifecycle_stage: ReadinessLifecycleStage;
  reconciliation_status: ReconciliationStatus;
  retry_required: boolean;
  prompt_ids: string[];
  blocker_codes: string[];
  drift_prompt_ids: string[];
  receipt_status: ExecutionComparisonStatus | 'unknown';
};

export type FleetUpdatedAdoptionState = {
  schemaVersion: '1.0';
  kind: 'fleet-adoption-updated-state';
  generated_at: string;
  execution_plan_digest: string;
  session_id: string;
  summary: {
    repos_total: number;
    by_reconciliation_status: Record<ReconciliationStatus, number>;
    repos_needing_retry: string[];
    stale_or_superseded_repo_ids: string[];
    blocked_repo_ids: string[];
    completed_repo_ids: string[];
  };
  repos: ReconciledRepoState[];
};

const ALL_STATUSES: ReconciliationStatus[] = [
  'completed_as_planned',
  'completed_with_drift',
  'partial',
  'failed',
  'blocked',
  'not_run',
  'retry_required',
  'stale_plan_or_superseded'
];

const sortStrings = (values: Iterable<string>): string[] => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const determineReconciliationStatus = (input: {
  receiptStatus: ExecutionComparisonStatus | 'unknown';
  retryRecommended: boolean;
  blockerCodes: string[];
  driftPromptIds: string[];
  plannedStage: ReadinessLifecycleStage | null;
  updatedStage: ReadinessLifecycleStage;
  priorStage: ReadinessLifecycleStage;
  promptIds: string[];
}): ReconciliationStatus => {
  if (input.promptIds.length === 0 || input.receiptStatus === 'unknown') return 'stale_plan_or_superseded';
  if (input.receiptStatus === 'not_run') return 'not_run';
  if (input.receiptStatus === 'mismatch') {
    if (input.updatedStage === input.priorStage) return 'stale_plan_or_superseded';
    return input.retryRecommended ? 'retry_required' : 'completed_with_drift';
  }
  if (input.blockerCodes.length > 0) return 'blocked';
  if (input.receiptStatus === 'failed') return input.retryRecommended ? 'retry_required' : 'failed';
  if (input.receiptStatus === 'partial_success') return input.retryRecommended ? 'retry_required' : 'partial';
  if (input.receiptStatus === 'success') {
    if (input.plannedStage !== null && input.updatedStage !== input.plannedStage) return 'completed_with_drift';
    if (input.driftPromptIds.length > 0) return 'completed_with_drift';
    return 'completed_as_planned';
  }
  return 'failed';
};

export const buildFleetUpdatedAdoptionState = (
  plan: FleetCodexExecutionPlan,
  queue: FleetAdoptionWorkQueue,
  fleet: FleetAdoptionReadinessSummary,
  receipt: FleetExecutionReceipt,
  options?: { generatedAt?: string }
): FleetUpdatedAdoptionState => {
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const queueByRepo = new Map(queue.work_items.map((item) => [item.repo_id, item]));
  const receiptByRepo = new Map(receipt.repo_results.map((result) => [result.repo_id, result]));
  const driftByRepo = new Map<string, string[]>();
  for (const drift of receipt.verification_summary.planned_vs_actual_drift) {
    driftByRepo.set(drift.repo_id, [...(driftByRepo.get(drift.repo_id) ?? []), drift.prompt_id]);
  }

  const repos: ReconciledRepoState[] = fleet.repos_by_priority.map((repo) => {
    const queueItem = queueByRepo.get(repo.repo_id);
    const receiptRepo = receiptByRepo.get(repo.repo_id);
    const promptIds = sortStrings(plan.codex_prompts.filter((prompt) => prompt.repo_id === repo.repo_id).map((prompt) => prompt.prompt_id));
    const blockerCodes = sortStrings([...(receiptRepo?.blockers ?? []), ...receipt.blockers.filter((blocker) => blocker.repo_id === repo.repo_id).map((blocker) => blocker.blocker_code)]);
    const driftPromptIds = sortStrings(driftByRepo.get(repo.repo_id) ?? []);
    const priorStage = queueItem?.lifecycle_stage ?? repo.lifecycle_stage;
    const plannedStage = receiptRepo?.planned_transition?.to ?? (queueItem ? queueItem.lifecycle_stage : null);
    const updatedStage = receiptRepo?.observed_transition.to ?? repo.lifecycle_stage;
    const receiptStatus = receiptRepo?.status ?? 'unknown';
    const retryRequired = Boolean(receiptRepo?.retry_recommended) || ['failed', 'partial_success', 'mismatch'].includes(receiptStatus);
    const reconciliationStatus = determineReconciliationStatus({
      receiptStatus,
      retryRecommended: retryRequired,
      blockerCodes,
      driftPromptIds,
      plannedStage,
      updatedStage,
      priorStage,
      promptIds
    });

    return {
      repo_id: repo.repo_id,
      prior_lifecycle_stage: priorStage,
      planned_lifecycle_stage: plannedStage,
      updated_lifecycle_stage: updatedStage,
      reconciliation_status: reconciliationStatus,
      retry_required: retryRequired || reconciliationStatus === 'retry_required',
      prompt_ids: promptIds,
      blocker_codes: blockerCodes,
      drift_prompt_ids: driftPromptIds,
      receipt_status: receiptStatus
    };
  });

  const byStatus = ALL_STATUSES.reduce<Record<ReconciliationStatus, number>>((acc, status) => {
    acc[status] = repos.filter((repo) => repo.reconciliation_status === status).length;
    return acc;
  }, {} as Record<ReconciliationStatus, number>);

  return {
    schemaVersion: '1.0',
    kind: 'fleet-adoption-updated-state',
    generated_at: generatedAt,
    execution_plan_digest: receipt.execution_plan_digest,
    session_id: receipt.session_id,
    summary: {
      repos_total: repos.length,
      by_reconciliation_status: byStatus,
      repos_needing_retry: sortStrings(repos.filter((repo) => repo.retry_required || repo.reconciliation_status === 'retry_required').map((repo) => repo.repo_id)),
      stale_or_superseded_repo_ids: sortStrings(repos.filter((repo) => repo.reconciliation_status === 'stale_plan_or_superseded').map((repo) => repo.repo_id)),
      blocked_repo_ids: sortStrings(repos.filter((repo) => repo.reconciliation_status === 'blocked').map((repo) => repo.repo_id)),
      completed_repo_ids: sortStrings(repos.filter((repo) => ['completed_as_planned', 'completed_with_drift'].includes(repo.reconciliation_status)).map((repo) => repo.repo_id))
    },
    repos
  };
};
