import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';

const routeTask = vi.fn();
const resolveTaskExecutionPlan = vi.fn();

vi.mock('@zachariahredfield/playbook-engine', () => ({ routeTask, resolveTaskExecutionPlan }));

describe('runRoute', () => {
  it('emits deterministic json route output with execution plan', async () => {
    const { runRoute } = await import('./route.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    routeTask.mockReturnValue({
      route: 'deterministic_local',
      why: 'Artifact read tasks are deterministic.',
      requiredInputs: ['task kind'],
      missingPrerequisites: [],
      repoMutationAllowed: false
    });

    resolveTaskExecutionPlan.mockReturnValue({
      schemaVersion: '1.0',
      kind: 'task-execution-plan',
      task: 'update command docs',
      route_status: 'resolved',
      task_family: 'docs_only',
      route_id: 'route/docs_only/v1',
      affected_surfaces: ['docs', 'governance'],
      estimated_change_surface: 'small',
      rule_packs: ['docs-governance'],
      required_validations: ['pnpm playbook docs audit --json'],
      optional_validations: ['pnpm -r build'],
      parallel_lanes: 2,
      mutation_allowed: false,
      warnings: [],
      missing_prerequisites: []
    });

    const exitCode = await runRoute('/repo', ['update', 'command', 'docs'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.command).toBe('route');
    expect(payload.selectedRoute).toBe('deterministic_local');
    expect(payload.executionPlan.route_id).toBe('route/docs_only/v1');

    logSpy.mockRestore();
  });

  it('fails when execution plan is incomplete', async () => {
    const { runRoute } = await import('./route.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    routeTask.mockReturnValue({
      route: 'model_reasoning',
      why: 'Fallback route.',
      requiredInputs: ['task kind'],
      missingPrerequisites: [],
      repoMutationAllowed: false
    });

    resolveTaskExecutionPlan.mockReturnValue({
      schemaVersion: '1.0',
      kind: 'task-execution-plan',
      task: 'do unknown thing',
      route_status: 'incomplete',
      task_family: 'unsupported',
      route_id: 'unsupported/incomplete',
      affected_surfaces: [],
      estimated_change_surface: 'large',
      rule_packs: [],
      required_validations: [],
      optional_validations: [],
      parallel_lanes: 1,
      mutation_allowed: false,
      warnings: [],
      missing_prerequisites: ['task intent must map to a supported family']
    });

    const exitCode = await runRoute('/repo', ['do', 'unknown', 'thing'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Failure);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.executionPlan.route_status).toBe('incomplete');

    logSpy.mockRestore();
  });
});
