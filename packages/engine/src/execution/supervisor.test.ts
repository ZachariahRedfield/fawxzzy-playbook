import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startExecution } from './supervisor.js';
import type { WorksetPlanArtifact } from '../orchestration/worksetPlan.js';
import type { WorkerLaunchPlanArtifact } from '../orchestration/workerLaunchPlan.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const worksetPlanFixture = (): WorksetPlanArtifact => ({
  schemaVersion: '1.0',
  kind: 'workset-plan',
  generatedAt: '1970-01-01T00:00:00.000Z',
  proposalOnly: true,
  input_tasks: [],
  routed_tasks: [],
  lanes: [
    {
      lane_id: 'lane-1',
      task_ids: ['task-1'],
      task_families: ['cli_command'],
      expected_surfaces: ['packages/cli/src/commands/execute.ts'],
      likely_conflict_surfaces: [],
      readiness_status: 'ready',
      blocking_reasons: [],
      conflict_surface_paths: [],
      shared_artifact_risk: 'low',
      assignment_confidence: 0.9,
      dependency_level: 'low',
      recommended_pr_size: 'small',
      worker_ready: true,
      codex_prompt: 'lane 1 prompt',
      protected_doc_consolidation: { has_protected_doc_work: false, stage: 'not_applicable', summary: 'none', next_command: null }
    },
    {
      lane_id: 'lane-2',
      task_ids: ['task-2'],
      task_families: ['cli_command'],
      expected_surfaces: ['packages/engine/src/execution/supervisor.ts'],
      likely_conflict_surfaces: [],
      readiness_status: 'ready',
      blocking_reasons: [],
      conflict_surface_paths: [],
      shared_artifact_risk: 'low',
      assignment_confidence: 0.9,
      dependency_level: 'low',
      recommended_pr_size: 'small',
      worker_ready: true,
      codex_prompt: 'lane 2 prompt',
      protected_doc_consolidation: { has_protected_doc_work: false, stage: 'not_applicable', summary: 'none', next_command: null }
    }
  ],
  blocked_tasks: [],
  dependency_edges: [],
  validation: { overlapping_file_domains: [], conflicting_artifact_ownership: [], blocked_lane_dependencies: [] },
  merge_risk_notes: [],
  sourceArtifacts: {
    tasksFile: { available: true, artifactPath: 'tasks.json' },
    taskExecutionProfile: { available: false, artifactPath: '.playbook/task-execution-profile.json' },
    learningState: { available: false, artifactPath: '.playbook/learning-state.json' }
  },
  warnings: []
});

const launchPlanFixture = (): WorkerLaunchPlanArtifact => ({
  schemaVersion: '1.0',
  kind: 'worker-launch-plan',
  proposalOnly: true,
  generatedAt: '1970-01-01T00:00:00.000Z',
  sourceArtifacts: {
    worksetPlanPath: '.playbook/workset-plan.json',
    laneStatePath: '.playbook/lane-state.json',
    workerAssignmentsPath: '.playbook/worker-assignments.json',
    verifyPath: '.playbook/verify-report.json',
    policyEvaluationPath: '.playbook/policy-evaluation.json'
  },
  summary: { launchEligibleLanes: ['lane-1'], blockedLanes: [{ lane_id: 'lane-2', blockers: ['lane:dependency blocked'] }], failClosedReasons: [] },
  lanes: [
    {
      lane_id: 'lane-1',
      worker_id: 'worker-lane-1',
      worker_type: 'general',
      launchEligible: true,
      blockers: [],
      requiredCapabilities: [],
      allowedWriteSurfaces: [],
      protectedSingletonImpact: { hasProtectedSingletonWork: false, targets: [], consolidationStage: 'not_applicable', unresolved: false },
      requiredReceipts: [],
      releaseReadyPreconditions: []
    },
    {
      lane_id: 'lane-2',
      worker_id: null,
      worker_type: null,
      launchEligible: false,
      blockers: ['lane:dependency blocked'],
      requiredCapabilities: [],
      allowedWriteSurfaces: [],
      protectedSingletonImpact: { hasProtectedSingletonWork: false, targets: [], consolidationStage: 'not_applicable', unresolved: false },
      requiredReceipts: [],
      releaseReadyPreconditions: []
    }
  ]
});

describe('startExecution', () => {
  it('initializes lane state from explicit launch authorization (not worker readiness)', async () => {
    const repo = createRepo('execution-supervisor-launch-auth');
    const run = await startExecution(worksetPlanFixture(), launchPlanFixture(), repo);

    expect(run.lanes['lane-1']?.state).toBe('ready');
    expect(run.lanes['lane-2']?.state).toBe('blocked');
  });
});

