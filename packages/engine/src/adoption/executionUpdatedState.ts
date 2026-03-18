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
  | 'stale_plan_or_superseded';

export type ReconciledActionState = {
  needs_retry: boolean;
  needs_replan: boolean;
  needs_review: boolean;
};

export type ReconciledRepoState = {
  repo_id: string;
  prior_lifecycle_stage: ReadinessLifecycleStage;
  planned_lifecycle_stage: ReadinessLifecycleStage | null;
  updated_lifecycle_stage: ReadinessLifecycleStage;
  reconciliation_status: ReconciliationStatus;
  action_state: ReconciledActionState;
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
    action_counts: {
      needs_retry: number;
      needs_replan: number;
      needs_review: number;
    };
    repos_needing_retry: string[];
    repos_needing_replan: string[];
    repos_needing_review: string[];
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
  'stale_plan_or_superseded'
];

const sortStrings = (values: Iterable<string>): string[] => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const determineReconciliationStatus = (input: {
  receiptStatus: ExecutionComparisonStatus | 'unknown';
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
    return 'completed_with_drift';
  }
  if (input.blockerCodes.length > 0) return 'blocked';
  if (input.receiptStatus === 'failed') return 'failed';
  if (input.receiptStatus === 'partial_success') return 'partial';
  if (input.receiptStatus === 'success') {
    if (input.plannedStage !== null && input.updatedStage !== input.plannedStage) return 'completed_with_drift';
    if (input.driftPromptIds.length > 0) return 'completed_with_drift';
    return 'completed_as_planned';
  }
  return 'failed';
};

const determineActionState = (input: {
  reconciliationStatus: ReconciliationStatus;
  receiptStatus: ExecutionComparisonStatus | 'unknown';
  blockerCodes: string[];
}): ReconciledActionState => {
  const hasBlockers = input.blockerCodes.length > 0;
  switch (input.reconciliationStatus) {
    case 'completed_as_planned':
      return { needs_retry: false, needs_replan: false, needs_review: false };
    case 'completed_with_drift':
      return { needs_retry: false, needs_replan: false, needs_review: true };
    case 'partial':
      return { needs_retry: true, needs_replan: false, needs_review: hasBlockers };
    case 'failed':
      return { needs_retry: true, needs_replan: false, needs_review: hasBlockers };
    case 'blocked':
      return {
        needs_retry: input.receiptStatus === 'failed' || input.receiptStatus === 'partial_success',
        needs_replan: false,
        needs_review: true
      };
    case 'not_run':
      return { needs_retry: false, needs_replan: false, needs_review: false };
    case 'stale_plan_or_superseded':
      return {
        needs_retry: input.receiptStatus === 'failed' || input.receiptStatus === 'partial_success',
        needs_replan: true,
        needs_review: true
      };
  }
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
    const plannedStage = receiptRepo?.planned_transition?.to ?? null;
    const updatedStage = receiptRepo?.observed_transition.to ?? repo.lifecycle_stage;
    const receiptStatus = receiptRepo?.status ?? 'unknown';
    const reconciliationStatus = determineReconciliationStatus({
      receiptStatus,
      blockerCodes,
      driftPromptIds,
      plannedStage,
      updatedStage,
      priorStage,
      promptIds
    });
    const actionState = determineActionState({
      reconciliationStatus,
      receiptStatus,
      blockerCodes
    });

    return {
      repo_id: repo.repo_id,
      prior_lifecycle_stage: priorStage,
      planned_lifecycle_stage: plannedStage,
      updated_lifecycle_stage: updatedStage,
      reconciliation_status: reconciliationStatus,
      action_state: actionState,
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
      action_counts: {
        needs_retry: repos.filter((repo) => repo.action_state.needs_retry).length,
        needs_replan: repos.filter((repo) => repo.action_state.needs_replan).length,
        needs_review: repos.filter((repo) => repo.action_state.needs_review).length
      },
      repos_needing_retry: sortStrings(repos.filter((repo) => repo.action_state.needs_retry).map((repo) => repo.repo_id)),
      repos_needing_replan: sortStrings(repos.filter((repo) => repo.action_state.needs_replan).map((repo) => repo.repo_id)),
      repos_needing_review: sortStrings(repos.filter((repo) => repo.action_state.needs_review).map((repo) => repo.repo_id)),
      stale_or_superseded_repo_ids: sortStrings(repos.filter((repo) => repo.reconciliation_status === 'stale_plan_or_superseded').map((repo) => repo.repo_id)),
      blocked_repo_ids: sortStrings(repos.filter((repo) => repo.reconciliation_status === 'blocked').map((repo) => repo.repo_id)),
      completed_repo_ids: sortStrings(repos.filter((repo) => ['completed_as_planned', 'completed_with_drift'].includes(repo.reconciliation_status)).map((repo) => repo.repo_id))
    },
    repos
  };
};
