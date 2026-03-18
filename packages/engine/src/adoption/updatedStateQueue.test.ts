import { describe, expect, it } from 'vitest';
import { deriveNextAdoptionQueueFromUpdatedState } from './updatedStateQueue.js';
import type { FleetUpdatedAdoptionState } from './executionUpdatedState.js';

const updatedState: FleetUpdatedAdoptionState = {
  schemaVersion: '1.0',
  kind: 'fleet-adoption-updated-state',
  generated_at: '2026-01-04T00:00:00.000Z',
  execution_plan_digest: 'digest-1',
  session_id: 'session-1',
  summary: {
    repos_total: 6,
    by_reconciliation_status: {
      completed_as_planned: 0,
      completed_with_drift: 1,
      partial: 1,
      failed: 1,
      blocked: 1,
      not_run: 1,
      stale_plan_or_superseded: 1
    },
    action_counts: { needs_retry: 3, needs_replan: 1, needs_review: 3 },
    repos_needing_retry: ['repo-failed', 'repo-not-run', 'repo-partial'],
    repos_needing_replan: ['repo-stale'],
    repos_needing_review: ['repo-blocked', 'repo-drift', 'repo-stale'],
    stale_or_superseded_repo_ids: ['repo-stale'],
    blocked_repo_ids: ['repo-blocked'],
    completed_repo_ids: ['repo-drift']
  },
  repos: [
    { repo_id: 'repo-partial', prior_lifecycle_stage: 'planned_apply_pending', planned_lifecycle_stage: 'ready', updated_lifecycle_stage: 'planned_apply_pending', reconciliation_status: 'partial', action_state: { needs_retry: true, needs_replan: false, needs_review: false }, prompt_ids: ['wave_1:apply_lane:repo-partial'], blocker_codes: [], drift_prompt_ids: [], receipt_status: 'partial_success' },
    { repo_id: 'repo-failed', prior_lifecycle_stage: 'planned_apply_pending', planned_lifecycle_stage: 'ready', updated_lifecycle_stage: 'planned_apply_pending', reconciliation_status: 'failed', action_state: { needs_retry: true, needs_replan: false, needs_review: false }, prompt_ids: ['wave_2:apply_lane:repo-failed'], blocker_codes: [], drift_prompt_ids: [], receipt_status: 'failed' },
    { repo_id: 'repo-not-run', prior_lifecycle_stage: 'planned_apply_pending', planned_lifecycle_stage: 'ready', updated_lifecycle_stage: 'planned_apply_pending', reconciliation_status: 'not_run', action_state: { needs_retry: true, needs_replan: false, needs_review: false }, prompt_ids: ['wave_1:apply_lane:repo-not-run'], blocker_codes: [], drift_prompt_ids: [], receipt_status: 'not_run' },
    { repo_id: 'repo-stale', prior_lifecycle_stage: 'planned_apply_pending', planned_lifecycle_stage: 'ready', updated_lifecycle_stage: 'indexed_plan_pending', reconciliation_status: 'stale_plan_or_superseded', action_state: { needs_retry: false, needs_replan: true, needs_review: true }, prompt_ids: ['wave_2:apply_lane:repo-stale'], blocker_codes: [], drift_prompt_ids: [], receipt_status: 'success' },
    { repo_id: 'repo-blocked', prior_lifecycle_stage: 'planned_apply_pending', planned_lifecycle_stage: 'ready', updated_lifecycle_stage: 'planned_apply_pending', reconciliation_status: 'blocked', action_state: { needs_retry: false, needs_replan: false, needs_review: true }, prompt_ids: ['wave_1:apply_lane:repo-blocked'], blocker_codes: ['manual_followup'], drift_prompt_ids: [], receipt_status: 'failed' },
    { repo_id: 'repo-drift', prior_lifecycle_stage: 'planned_apply_pending', planned_lifecycle_stage: 'ready', updated_lifecycle_stage: 'indexed_plan_pending', reconciliation_status: 'completed_with_drift', action_state: { needs_retry: false, needs_replan: false, needs_review: true }, prompt_ids: ['wave_1:apply_lane:repo-drift'], blocker_codes: [], drift_prompt_ids: ['wave_1:apply_lane:repo-drift'], receipt_status: 'success' }
  ]
};

describe('deriveNextAdoptionQueueFromUpdatedState', () => {
  it('derives retry/replan queue entries from updated-state only with canonical reconciliation-priority ordering and lineage', () => {
    const first = deriveNextAdoptionQueueFromUpdatedState(updatedState, { generatedAt: '2026-01-05T00:00:00.000Z' });
    const second = deriveNextAdoptionQueueFromUpdatedState(updatedState, { generatedAt: '2026-01-05T00:00:00.000Z' });

    expect(first).toEqual(second);
    expect(first.queue_source).toBe('updated_state');
    expect(first.work_items.map((item) => item.repo_id)).toEqual(['repo-failed', 'repo-partial', 'repo-not-run', 'repo-stale']);
    expect(first.work_items.map((item) => item.next_action)).toEqual(['retry', 'retry', 'retry', 'replan']);
    expect(first.work_items.find((item) => item.repo_id === 'repo-blocked')).toBeUndefined();
    expect(first.work_items.find((item) => item.repo_id === 'repo-drift')).toBeUndefined();
    expect(first.work_items.find((item) => item.repo_id === 'repo-stale')?.recommended_command).toBe('pnpm playbook verify --json && pnpm playbook plan --json');
    expect(first.work_items.find((item) => item.repo_id === 'repo-failed')?.prompt_lineage).toEqual(['wave_2:apply_lane:repo-failed']);
    expect(first.waves.find((wave) => wave.wave === 'wave_1')?.repo_ids).toEqual(['repo-not-run', 'repo-partial']);
    expect(first.waves.find((wave) => wave.wave === 'wave_2')?.repo_ids).toEqual(['repo-failed', 'repo-stale']);
  });
});
