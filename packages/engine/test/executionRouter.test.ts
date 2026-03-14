import { describe, expect, it } from 'vitest';
import { buildTaskExecutionProfile } from '../src/routing/executionRouter.js';

describe('buildTaskExecutionProfile', () => {
  it('routes docs-only tasks to a bounded docs governance profile', () => {
    const profile = buildTaskExecutionProfile({
      changedFiles: ['docs/contracts/TASK_EXECUTION_PROFILE.md'],
      affectedPackages: [],
      generatedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(profile.proposalOnly).toBe(true);
    expect(profile.profiles).toHaveLength(1);
    expect(profile.profiles[0]).toMatchObject({
      task_family: 'docs_only',
      rule_packs: ['docs-governance'],
      required_validations: ['pnpm playbook docs audit --json'],
      parallel_safe: true
    });
  });

  it('emits deterministic output for repeated calls', () => {
    const input = {
      changedFiles: ['packages/contracts/src/task-execution-profile.schema.json', 'docs/contracts/TASK_EXECUTION_PROFILE.md'],
      affectedPackages: ['@zachariahredfield/playbook-core'],
      declaredSurfaces: ['contracts', 'schemas'] as const,
      generatedAt: '2026-01-01T00:00:00.000Z'
    };

    const first = buildTaskExecutionProfile(input);
    const second = buildTaskExecutionProfile(input);

    expect(first).toEqual(second);
    expect(first.profiles.map((entry) => entry.task_family)).toEqual(['contracts_schema']);
  });

  it('includes required validation bundles for cli, engine scoring, and pattern learning tasks', () => {
    const cliProfile = buildTaskExecutionProfile({
      changedFiles: ['packages/cli/src/commands/route.ts'],
      affectedPackages: ['@fawxzzy/playbook'],
      generatedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(cliProfile.profiles[0]?.required_validations).toEqual(['pnpm -r build', 'pnpm agents:update', 'pnpm agents:check']);

    const engineScoringProfile = buildTaskExecutionProfile({
      changedFiles: ['packages/engine/src/scoring/patternFitnessScore.ts'],
      affectedPackages: ['@zachariahredfield/playbook-engine'],
      generatedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(engineScoringProfile.profiles[0]?.required_validations).toEqual([
      'pnpm --filter @zachariahredfield/playbook-engine test',
      'pnpm -r build'
    ]);

    const learningProfile = buildTaskExecutionProfile({
      changedFiles: ['packages/engine/src/learning/patternProposalBridge.ts'],
      affectedPackages: ['@zachariahredfield/playbook-engine'],
      generatedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(learningProfile.profiles[0]?.required_validations).toEqual([
      'pnpm --filter @zachariahredfield/playbook-engine test',
      'pnpm -r build'
    ]);
  });
});
