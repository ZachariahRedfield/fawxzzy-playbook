import { describe, expect, it } from 'vitest';
import type { ArchitectureRegistry } from '@zachariahredfield/playbook-core';
import { validateArtifacts } from './validateArtifacts.js';

const knownCommands = ['index', 'execute', 'telemetry', 'lanes'];

const createRegistry = (subsystems: ArchitectureRegistry['subsystems']): ArchitectureRegistry => ({
  version: 1,
  subsystems
});

describe('validateArtifacts', () => {
  it('accepts valid upstream/downstream relationships', () => {
    const result = validateArtifacts(
      createRegistry([
        {
          name: 'observation_engine',
          purpose: 'Deterministic repository understanding',
          commands: ['index'],
          artifacts: ['.playbook/repo-index.json'],
          downstream: ['execution_supervisor']
        },
        {
          name: 'execution_supervisor',
          purpose: 'Run workers and monitor execution',
          commands: ['execute'],
          artifacts: ['.playbook/execution-state.json'],
          upstream: ['observation_engine'],
          downstream: ['telemetry_learning', 'lane_lifecycle']
        },
        {
          name: 'telemetry_learning',
          purpose: 'Execution telemetry and learning state',
          commands: ['telemetry'],
          artifacts: ['.playbook/learning-state.json']
        },
        {
          name: 'lane_lifecycle',
          purpose: 'Track orchestration progress',
          commands: ['lanes'],
          artifacts: ['.playbook/lane-state.json']
        }
      ]),
      { knownCommands }
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports unknown dependencies and invalid subsystem names', () => {
    const result = validateArtifacts(
      createRegistry([
        {
          name: 'ExecutionSupervisor',
          purpose: 'Run workers and monitor execution',
          commands: ['execute'],
          artifacts: ['.playbook/execution-state.json'],
          upstream: ['missing_subsystem']
        }
      ]),
      { knownCommands }
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Invalid subsystem name "ExecutionSupervisor". Names must be lowercase snake_case with only letters, numbers, and underscores.'
    );
    expect(result.errors).toContain('Unknown upstream dependency "missing_subsystem" in subsystem "ExecutionSupervisor".');
  });

  it('detects circular subsystem dependencies', () => {
    const result = validateArtifacts(
      createRegistry([
        {
          name: 'orchestration_planner',
          purpose: 'Parallel work decomposition',
          commands: ['index'],
          artifacts: ['.playbook/workset-plan.json'],
          downstream: ['execution_supervisor']
        },
        {
          name: 'execution_supervisor',
          purpose: 'Run workers and monitor execution',
          commands: ['execute'],
          artifacts: ['.playbook/execution-state.json'],
          downstream: ['orchestration_planner']
        }
      ]),
      { knownCommands }
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Circular subsystem dependency detected: orchestration_planner -> execution_supervisor -> orchestration_planner'
    );
  });
});
