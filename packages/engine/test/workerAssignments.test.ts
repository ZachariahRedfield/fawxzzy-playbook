import { describe, expect, it } from 'vitest';
import type { LaneStateArtifact } from '../src/orchestration/laneState.js';
import type { WorksetPlanArtifact } from '../src/orchestration/worksetPlan.js';
import { assignWorkersToLanes } from '../src/orchestration/workerAssignments.js';

const basePlan = (): WorksetPlanArtifact => ({
  schemaVersion: '1.0',
  kind: 'workset-plan',
  generatedAt: '1970-01-01T00:00:00.000Z',
  proposalOnly: true,
  input_tasks: [],
  routed_tasks: [],
  lanes: [
    {
      lane_id: 'lane-a',
      task_ids: ['task-a'],
      task_families: ['docs_only'],
      expected_surfaces: ['docs/a.md'],
      likely_conflict_surfaces: [],
      readiness_status: 'ready',
      blocking_reasons: [],
      conflict_surface_paths: [],
      shared_artifact_risk: 'low',
      assignment_confidence: 0.94,
      dependency_level: 'low',
      recommended_pr_size: 'small',
      worker_ready: true,
      codex_prompt: 'Prompt for lane a'
    },
    {
      lane_id: 'lane-b',
      task_ids: ['task-b'],
      task_families: ['cli_command'],
      expected_surfaces: ['packages/cli/src/commands/index.ts'],
      likely_conflict_surfaces: [],
      readiness_status: 'ready',
      blocking_reasons: [],
      conflict_surface_paths: [],
      shared_artifact_risk: 'low',
      assignment_confidence: 0.84,
      dependency_level: 'medium',
      recommended_pr_size: 'small',
      worker_ready: true,
      codex_prompt: 'Prompt for lane b'
    },
    {
      lane_id: 'lane-c',
      task_ids: ['task-c'],
      task_families: ['engine_scoring'],
      expected_surfaces: ['packages/engine/src/index.ts'],
      likely_conflict_surfaces: [],
      readiness_status: 'ready',
      blocking_reasons: [],
      conflict_surface_paths: [],
      shared_artifact_risk: 'low',
      assignment_confidence: 0.74,
      dependency_level: 'high',
      recommended_pr_size: 'small',
      worker_ready: true,
      codex_prompt: 'Prompt for lane c'
    }
  ],
  blocked_tasks: [],
  dependency_edges: [
    { from_lane_id: 'lane-a', to_lane_id: 'lane-c', reason: 'lane-a must complete before lane-c' }
  ],
  merge_risk_notes: [],
  sourceArtifacts: {
    tasksFile: { available: true, artifactPath: './fixtures/tasks.json' },
    taskExecutionProfile: { available: false, artifactPath: '.playbook/task-execution-profile.json' },
    learningState: { available: false, artifactPath: '.playbook/learning-state.json' }
  },
  warnings: []
});

const laneStateFixture = (): LaneStateArtifact => ({
  schemaVersion: '1.0',
  kind: 'lane-state',
  generatedAt: '1970-01-01T00:00:00.000Z',
  proposalOnly: true,
  workset_plan_path: '.playbook/workset-plan.json',
  lanes: [
    {
      lane_id: 'lane-a',
      task_ids: ['task-a'],
      status: 'ready',
      readiness_status: 'ready',
      dependency_level: 'low',
      dependencies_satisfied: true,
      blocked_reasons: [],
      blocking_reasons: [],
      conflict_surface_paths: [],
      shared_artifact_risk: 'low',
      assignment_confidence: 0.94,
      verification_summary: { status: 'pending', required_checks: [], optional_checks: [], notes: [] },
      merge_ready: false,
      worker_ready: true
    },
    {
      lane_id: 'lane-b',
      task_ids: ['task-b'],
      status: 'blocked',
      readiness_status: 'blocked',
      dependency_level: 'medium',
      dependencies_satisfied: false,
      blocked_reasons: ['waiting on dependency lane lane-a'],
      blocking_reasons: ['waiting on dependency lane lane-a'],
      conflict_surface_paths: ['packages/cli/src/commands/index.ts'],
      shared_artifact_risk: 'medium',
      assignment_confidence: 0.5,
      verification_summary: { status: 'blocked', required_checks: [], optional_checks: [], notes: [] },
      merge_ready: false,
      worker_ready: true
    },
    {
      lane_id: 'lane-c',
      task_ids: ['task-c'],
      status: 'ready',
      readiness_status: 'blocked',
      dependency_level: 'high',
      dependencies_satisfied: false,
      blocked_reasons: ['waiting on dependency lane lane-a'],
      blocking_reasons: ['waiting on dependency lane lane-a'],
      conflict_surface_paths: ['packages/engine/src/index.ts'],
      shared_artifact_risk: 'high',
      assignment_confidence: 0.4,
      verification_summary: { status: 'blocked', required_checks: [], optional_checks: [], notes: [] },
      merge_ready: false,
      worker_ready: true
    }
  ],
  blocked_lanes: ['lane-b', 'lane-c'],
  ready_lanes: ['lane-a'],
  running_lanes: [],
  completed_lanes: [],
  merge_ready_lanes: [],
  dependency_status: { total_edges: 1, satisfied_edges: 0, unsatisfied_edges: 1 },
  merge_readiness: { merge_ready_lanes: [], not_merge_ready_lanes: [] },
  verification_status: { status: 'blocked', lanes_pending_verification: ['lane-a'], lanes_blocked_from_verification: ['lane-b', 'lane-c'] },
  warnings: []
});

describe('assignWorkersToLanes', () => {
  it('assigns worker to ready lane', () => {
    const artifact = assignWorkersToLanes(laneStateFixture(), basePlan());
    const lane = artifact.lanes.find((entry) => entry.lane_id === 'lane-a');

    expect(lane?.status).toBe('assigned');
    expect(lane?.readiness_status).toBe('ready');
    expect(lane?.assigned_prompt).toBe('.playbook/prompts/lane-a.md');
  });

  it('skips blocked lane assignment', () => {
    const artifact = assignWorkersToLanes(laneStateFixture(), basePlan());
    expect(artifact.lanes.find((entry) => entry.lane_id === 'lane-b')?.status).toBe('blocked');
  });

  it('reports readiness summary with blocked reasons and conflict surfaces', () => {
    const artifact = assignWorkersToLanes(laneStateFixture(), basePlan());
    expect(artifact.readiness_summary.ready_lanes).toEqual(['lane-a']);
    expect(artifact.readiness_summary.blocked_lanes.find((entry) => entry.lane_id === 'lane-b')?.reasons[0]).toContain('waiting on dependency lane');
    expect(artifact.readiness_summary.conflict_surface_paths).toEqual([
      'packages/cli/src/commands/index.ts',
      'packages/engine/src/index.ts'
    ]);
  });

  it('skips dependency-gated lane assignment when dependencies are unsatisfied', () => {
    const artifact = assignWorkersToLanes(laneStateFixture(), basePlan());
    expect(artifact.lanes.find((entry) => entry.lane_id === 'lane-c')?.status).toBe('blocked');
  });

  it('keeps deterministic ordering across multiple ready assignments', () => {
    const laneState = laneStateFixture();
    laneState.lanes[1].status = 'ready';
    laneState.lanes[1].dependencies_satisfied = true;
    laneState.lanes[1].blocked_reasons = [];
    laneState.ready_lanes = ['lane-a', 'lane-b'];
    laneState.blocked_lanes = ['lane-c'];

    const artifact = assignWorkersToLanes(laneState, basePlan());
    const assigned = artifact.lanes.filter((entry) => entry.status === 'assigned').map((entry) => entry.lane_id);

    expect(assigned).toEqual(['lane-a', 'lane-b']);
    expect(artifact.workers[0]?.lane_ids).toEqual(['lane-a']);
    expect(artifact.workers[1]?.lane_ids).toEqual(['lane-b']);
  });
});
