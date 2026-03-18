import { describe, expect, it } from 'vitest';
import {
  buildQueueInterpretation,
  buildRepoStatusInterpretation,
  buildRouteInterpretation
} from './interpretation.js';

describe('interpretation helpers', () => {
  it('keeps repo status summary aligned with raw readiness and exposes one primary next action', () => {
    const interpretation = buildRepoStatusInterpretation({
      ok: false,
      adoption: {
        schemaVersion: '1.0',
        connection_status: 'connected',
        playbook_detected: true,
        governed_artifacts_present: {
          repo_index: { present: true, valid: true, stale: false, failure_type: null },
          repo_graph: { present: true, valid: true, stale: false, failure_type: null },
          plan: { present: false, valid: false, stale: false, failure_type: 'missing_prerequisite_artifact' },
          policy_apply_result: { present: false, valid: false, stale: false, failure_type: 'missing_prerequisite_artifact' }
        },
        lifecycle_stage: 'indexed_plan_pending',
        fallback_proof_ready: false,
        cross_repo_eligible: true,
        blockers: [
          {
            code: 'plan_required',
            message: 'Plan artifact is missing or invalid.',
            next_command: 'pnpm playbook verify --json && pnpm playbook plan --json'
          }
        ],
        recommended_next_steps: ['pnpm playbook verify --json && pnpm playbook plan --json']
      },
      topIssueDescription: 'Plan artifact is missing or invalid.',
      topIssueId: 'plan_required'
    });

    expect(interpretation.progressive_disclosure.default_view.state).toBe('indexed_plan_pending');
    expect(interpretation.progressive_disclosure.default_view.next_step.command).toBe('pnpm playbook verify --json && pnpm playbook plan --json');
    expect(interpretation.progressive_disclosure.secondary_view.blockers[0]).toContain('plan_required');
  });

  it('keeps queue summaries actionable while preserving blocked deep details', () => {
    const interpretation = buildQueueInterpretation({
      schemaVersion: '1.0',
      kind: 'fleet-adoption-work-queue',
      generated_at: '2026-01-01T00:00:00.000Z',
      total_repos: 1,
      queue_source: 'updated_state',
      work_items: [
        {
          item_id: 'item-1',
          repo_id: 'repo-a',
          repo_name: 'Repo A',
          lifecycle_stage: 'indexed_plan_pending',
          blocker_codes: ['plan_required'],
          recommended_command: 'pnpm playbook verify --json && pnpm playbook plan --json',
          priority_stage: 'plan_pending',
          severity: 'high',
          parallel_group: 'verify/plan lane',
          dependencies: [],
          rationale: 'plan is the next governed step',
          wave: 'wave_1',
          next_action: 'generate plan',
          prompt_lineage: []
        }
      ],
      waves: [{ wave: 'wave_1', repo_count: 1, action_count: 1 }],
      grouped_actions: [{ parallel_group: 'verify/plan lane', command: 'pnpm playbook verify --json && pnpm playbook plan --json', repo_ids: ['repo-a'] }],
      blocked_items: [{ item_id: 'item-2', repo_id: 'repo-b', unmet_dependencies: ['item-1'] }]
    } as never);

    expect(interpretation.progressive_disclosure.default_view.next_step.command).toBe('pnpm playbook verify --json && pnpm playbook plan --json');
    expect(interpretation.progressive_disclosure.deep_view.raw_truth_refs).toContain('queue.blocked_items');
  });

  it('keeps route summaries grounded in raw routing truth', () => {
    const interpretation = buildRouteInterpretation({
      task: 'update command docs',
      selectedRoute: 'deterministic_local',
      why: 'Task family classification matched a deterministic task-execution-profile.',
      requiredInputs: ['task input', 'affected surfaces'],
      executionPlan: {
        required_validations: ['pnpm playbook docs audit --json'],
        missing_prerequisites: [],
        warnings: ['warning-a'],
        open_questions: ['question-a'],
        route_id: 'deterministic_local:docs_only'
      },
      promotion: {
        candidate_artifact_path: '.playbook/staged/workflow-route/execution-plan.json',
        committed_target_path: '.playbook/execution-plan.json'
      }
    });

    expect(interpretation.progressive_disclosure.default_view.next_step.command).toBe('pnpm playbook docs audit --json');
    expect(interpretation.progressive_disclosure.deep_view.artifact_paths).toContain('.playbook/execution-plan.json');
    expect(interpretation.progressive_disclosure.deep_view.diagnostics).toEqual(['warning-a', 'question-a']);
  });
});
