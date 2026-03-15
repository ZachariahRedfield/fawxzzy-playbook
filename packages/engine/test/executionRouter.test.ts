import { describe, expect, it } from 'vitest';
import { buildTaskExecutionProfile, resolveTaskExecutionPlan } from '../src/routing/executionRouter.js';

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
});

describe('resolveTaskExecutionPlan', () => {
  it('resolves docs-only task', () => {
    const plan = resolveTaskExecutionPlan({ task: 'update docs and changelog' });
    expect(plan.task_family).toBe('docs_only');
    expect(plan.route_status).toBe('resolved');
    expect(plan.route_id).toBe('route/docs_only/v1');
  });

  it('resolves contracts/schema task', () => {
    const plan = resolveTaskExecutionPlan({ task: 'update contract schema registry entry' });
    expect(plan.task_family).toBe('contracts_schema');
    expect(plan.required_validations).toContain('pnpm playbook schema verify --json');
  });

  it('resolves CLI command task', () => {
    const plan = resolveTaskExecutionPlan({ task: 'add new cli command flag' });
    expect(plan.task_family).toBe('cli_command');
    expect(plan.rule_packs).toEqual(['command-surface-governance', 'docs-governance']);
  });

  it('resolves engine scoring task', () => {
    const plan = resolveTaskExecutionPlan({ task: 'adjust engine scoring fitness threshold' });
    expect(plan.task_family).toBe('engine_scoring');
    expect(plan.affected_surfaces).toContain('engine');
  });

  it('resolves pattern-learning task', () => {
    const plan = resolveTaskExecutionPlan({ task: 'improve pattern learning knowledge graph linkage' });
    expect(plan.task_family).toBe('pattern_learning');
    expect(plan.optional_validations).toContain('pnpm playbook patterns list --json');
  });

  it('emits incomplete route for unsupported task intent', () => {
    const plan = resolveTaskExecutionPlan({ task: 'book a team offsite' });
    expect(plan.route_status).toBe('incomplete');
    expect(plan.task_family).toBe('unsupported');
    expect(plan.missing_prerequisites.length).toBeGreaterThan(0);
  });

  it('uses conservative route on ambiguous task family classification', () => {
    const plan = resolveTaskExecutionPlan({ task: 'update cli command docs and contract schema' });
    expect(plan.task_family).toBe('cli_command');
    expect(plan.warnings[0]).toContain('Ambiguous task-family classification');
  });
});
