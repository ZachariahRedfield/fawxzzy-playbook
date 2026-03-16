import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';
import { runWorkers } from './workers/index.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const writeWorksetPlan = (repo: string): void => {
  const workset = {
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
        task_families: ['docs_only'],
        expected_surfaces: ['docs/README.md'],
        likely_conflict_surfaces: [],
        readiness_status: 'ready',
        blocking_reasons: [],
        conflict_surface_paths: [],
        shared_artifact_risk: 'low',
        assignment_confidence: 0.94,
        dependency_level: 'low',
        recommended_pr_size: 'small',
        worker_ready: true,
        codex_prompt: 'Prompt for lane 1'
      },
      {
        lane_id: 'lane-2',
        task_ids: ['task-2'],
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
        codex_prompt: 'Prompt for lane 2'
      }
    ],
    blocked_tasks: [],
    dependency_edges: [{ from_lane_id: 'lane-1', to_lane_id: 'lane-2', reason: 'lane-1 first' }],
    validation: {
      overlapping_file_domains: [],
      conflicting_artifact_ownership: [],
      blocked_lane_dependencies: []
    },
    merge_risk_notes: [],
    sourceArtifacts: {
      tasksFile: { available: true, artifactPath: './fixtures/tasks.json' },
      taskExecutionProfile: { available: false, artifactPath: '.playbook/task-execution-profile.json' },
      learningState: { available: false, artifactPath: '.playbook/learning-state.json' }
    },
    warnings: []
  };

  fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.playbook', 'workset-plan.json'), `${JSON.stringify(workset, null, 2)}\n`, 'utf8');
};

describe('runWorkers', () => {
  it('assigns ready lanes and writes worker assignment + prompt artifacts', async () => {
    const repo = createRepo('playbook-cli-workers-ready');
    writeWorksetPlan(repo);
    const laneState = {
      schemaVersion: '1.0',
      kind: 'lane-state',
      generatedAt: '1970-01-01T00:00:00.000Z',
      proposalOnly: true,
      workset_plan_path: '.playbook/workset-plan.json',
      lanes: [
        {
          lane_id: 'lane-1',
          task_ids: ['task-1'],
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
          lane_id: 'lane-2',
          task_ids: ['task-2'],
          status: 'blocked',
          readiness_status: 'blocked',
          dependency_level: 'medium',
          dependencies_satisfied: false,
          blocked_reasons: ['waiting on dependency lane lane-1'],
          blocking_reasons: ['waiting on dependency lane lane-1'],
          conflict_surface_paths: [],
          shared_artifact_risk: 'medium',
          assignment_confidence: 0.5,
          verification_summary: { status: 'blocked', required_checks: [], optional_checks: [], notes: [] },
          merge_ready: false,
          worker_ready: true
        }
      ],
      blocked_lanes: ['lane-2'],
      ready_lanes: ['lane-1'],
      running_lanes: [],
      completed_lanes: [],
      merge_ready_lanes: [],
      dependency_status: { total_edges: 1, satisfied_edges: 0, unsatisfied_edges: 1 },
      merge_readiness: { merge_ready_lanes: [], not_merge_ready_lanes: [] },
      verification_status: { status: 'blocked', lanes_pending_verification: ['lane-1'], lanes_blocked_from_verification: ['lane-2'] },
      warnings: []
    };

    fs.writeFileSync(path.join(repo, '.playbook', 'lane-state.json'), `${JSON.stringify(laneState, null, 2)}\n`, 'utf8');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitCode = await runWorkers(repo, { format: 'json', quiet: false, action: 'assign' });

    expect(exitCode).toBe(ExitCode.Success);
    expect(fs.existsSync(path.join(repo, '.playbook', 'worker-assignments.json'))).toBe(true);
    expect(fs.existsSync(path.join(repo, '.playbook', 'prompts', 'lane-1.md'))).toBe(true);
    expect(fs.existsSync(path.join(repo, '.playbook', 'prompts', 'lane-2.md'))).toBe(false);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      command: string;
      worker_assignments: { kind: string; lanes: Array<{ lane_id: string; status: string }> };
    };
    expect(payload.command).toBe('workers');
    expect(payload.worker_assignments.kind).toBe('worker-assignments');
    expect(payload.worker_assignments.lanes.find((lane) => lane.lane_id === 'lane-1')?.status).toBe('assigned');
    expect(payload.worker_assignments.lanes.find((lane) => lane.lane_id === 'lane-2')?.status).toBe('blocked');

    logSpy.mockRestore();
  });

  it('returns deterministic missing-workset error in json mode', async () => {
    const repo = createRepo('playbook-cli-workers-missing');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runWorkers(repo, { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Failure);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { command: string; error: string };
    expect(payload.command).toBe('workers');
    expect(payload.error).toContain('missing workset plan');

    logSpy.mockRestore();
  });
});

describe('command registry', () => {
  it('registers the workers command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'workers');
    expect(command).toBeDefined();
    expect(command?.description).toBe('Assign deterministic proposal-only workers to ready lanes from .playbook/lane-state.json');
  });
});
