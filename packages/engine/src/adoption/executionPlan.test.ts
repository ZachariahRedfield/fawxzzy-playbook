import { describe, expect, it } from 'vitest';
import { buildFleetAdoptionWorkQueue } from './workQueue.js';
import { buildFleetCodexExecutionPlan } from './executionPlan.js';
import type { FleetAdoptionReadinessSummary } from './fleetReadiness.js';

const makeFleet = (): FleetAdoptionReadinessSummary => ({
  schemaVersion: '1.0',
  kind: 'fleet-adoption-readiness-summary',
  total_repos: 3,
  by_lifecycle_stage: {
    not_connected: 1,
    playbook_not_detected: 1,
    playbook_detected_index_pending: 1,
    indexed_plan_pending: 0,
    planned_apply_pending: 0,
    ready: 0
  },
  playbook_detected_count: 2,
  fallback_proof_ready_count: 0,
  cross_repo_eligible_count: 1,
  blocker_frequencies: [],
  recommended_actions: [],
  repos_by_priority: [
    { repo_id: 'repo-a', repo_name: 'Repo A', lifecycle_stage: 'not_connected', priority_stage: 'repo_not_connected', blocker_codes: ['repo_not_connected'], next_action: 'pnpm playbook observer repo add <path>' },
    { repo_id: 'repo-b', repo_name: 'Repo B', lifecycle_stage: 'playbook_not_detected', priority_stage: 'playbook_not_detected', blocker_codes: ['playbook_not_detected'], next_action: 'pnpm playbook init' },
    { repo_id: 'repo-c', repo_name: 'Repo C', lifecycle_stage: 'playbook_detected_index_pending', priority_stage: 'index_pending', blocker_codes: ['index_required'], next_action: 'pnpm playbook index --json' }
  ]
});

describe('buildFleetCodexExecutionPlan', () => {
  it('is deterministic with stable ordering and prompt ids', () => {
    const queue = buildFleetAdoptionWorkQueue(makeFleet(), { generatedAt: '2026-01-01T00:00:00.000Z' });
    const first = buildFleetCodexExecutionPlan(queue, { generatedAt: '2026-01-02T00:00:00.000Z' });
    const second = buildFleetCodexExecutionPlan(queue, { generatedAt: '2026-01-02T00:00:00.000Z' });

    expect(first).toEqual(second);
    expect(first.codex_prompts.map((prompt) => prompt.prompt_id)).toEqual([
      'wave_1:connect_lane:repo-a',
      'wave_1:init_lane:repo-b',
      'wave_1:index_lane:repo-c',
      'wave_2:init_lane:repo-a',
      'wave_2:index_lane:repo-b',
      'wave_2:verify/plan_lane:repo-c'
    ]);
  });

  it('orders worker lanes by lifecycle progression', () => {
    const queue = buildFleetAdoptionWorkQueue(makeFleet(), { generatedAt: '2026-01-01T00:00:00.000Z' });
    const plan = buildFleetCodexExecutionPlan(queue, { generatedAt: '2026-01-02T00:00:00.000Z' });

    expect(plan.waves.find((wave) => wave.wave_id === 'wave_1')?.worker_lanes).toEqual([
      'wave_1:connect_lane',
      'wave_1:init_lane',
      'wave_1:index_lane'
    ]);

    expect(plan.waves.find((wave) => wave.wave_id === 'wave_2')?.worker_lanes).toEqual([
      'wave_2:init_lane',
      'wave_2:index_lane',
      'wave_2:verify_plan_lane'
    ]);
  });

  it('uses repo_id as tie-breaker within same lane and wave', () => {
    const fleet = makeFleet();
    fleet.total_repos = 4;
    fleet.by_lifecycle_stage.playbook_detected_index_pending = 2;
    fleet.repos_by_priority = [
      ...fleet.repos_by_priority,
      {
        repo_id: 'repo-aa',
        repo_name: 'Repo AA',
        lifecycle_stage: 'playbook_detected_index_pending',
        priority_stage: 'index_pending',
        blocker_codes: ['index_required'],
        next_action: 'pnpm playbook index --json'
      }
    ];

    const queue = buildFleetAdoptionWorkQueue(fleet, { generatedAt: '2026-01-01T00:00:00.000Z' });
    const plan = buildFleetCodexExecutionPlan(queue, { generatedAt: '2026-01-02T00:00:00.000Z' });
    const wave1IndexPrompts = plan.codex_prompts
      .filter((prompt) => prompt.wave === 'wave_1' && prompt.lane_id === 'wave_1:index_lane')
      .map((prompt) => prompt.repo_id);

    expect(wave1IndexPrompts).toEqual(['repo-aa', 'repo-c']);
  });

  it('separates wave_1 and wave_2 by dependency boundary', () => {
    const queue = buildFleetAdoptionWorkQueue(makeFleet(), { generatedAt: '2026-01-01T00:00:00.000Z' });
    const plan = buildFleetCodexExecutionPlan(queue, { generatedAt: '2026-01-02T00:00:00.000Z' });
    const wave1PromptRepos = new Set(plan.codex_prompts.filter((prompt) => prompt.wave === 'wave_1').map((prompt) => prompt.repo_id));
    const wave2PromptRepos = new Set(plan.codex_prompts.filter((prompt) => prompt.wave === 'wave_2').map((prompt) => prompt.repo_id));

    expect(wave1PromptRepos.has('repo-a')).toBe(true);
    expect(wave2PromptRepos.has('repo-a')).toBe(true);
    expect(plan.blocked_followups.some((followup) => followup.repo_id === 'repo-a')).toBe(true);
  });

  it('avoids same-repo conflicting lane assignments in same wave', () => {
    const queue = buildFleetAdoptionWorkQueue(makeFleet(), { generatedAt: '2026-01-01T00:00:00.000Z' });
    const plan = buildFleetCodexExecutionPlan(queue, { generatedAt: '2026-01-02T00:00:00.000Z' });

    for (const wave of ['wave_1', 'wave_2'] as const) {
      const map = new Map<string, number>();
      for (const prompt of plan.codex_prompts.filter((entry) => entry.wave === wave)) {
        map.set(prompt.repo_id, (map.get(prompt.repo_id) ?? 0) + 1);
      }
      expect([...map.values()].every((count) => count <= 1)).toBe(true);
    }
  });

  it('includes stable JSON shape and explicit governance notes', () => {
    const queue = buildFleetAdoptionWorkQueue(makeFleet(), { generatedAt: '2026-01-01T00:00:00.000Z' });
    const plan = buildFleetCodexExecutionPlan(queue, { generatedAt: '2026-01-02T00:00:00.000Z' });

    expect(plan).toMatchObject({
      schemaVersion: '1.0',
      kind: 'fleet-adoption-codex-execution-plan',
      waves: expect.any(Array),
      worker_lanes: expect.any(Array),
      codex_prompts: expect.any(Array),
      execution_notes: expect.any(Array),
      blocked_followups: expect.any(Array)
    });

    expect(plan.codex_prompts.every((prompt) =>
      prompt.governance_notes.rules.length > 0 &&
      prompt.governance_notes.patterns.length > 0 &&
      prompt.governance_notes.failure_modes.length > 0
    )).toBe(true);
  });
});
