import { describe, expect, it } from 'vitest';
import type { Rule } from '../src/execution/types.js';
import { FixExecutor } from '../src/execution/fixExecutor.js';
import { PlanGenerator } from '../src/execution/planGenerator.js';
import { RuleRunner } from '../src/execution/ruleRunner.js';

describe('execution pipeline units', () => {
  it('RuleRunner aggregates findings from all rules', () => {
    const rules: Rule[] = [
      {
        id: 'one',
        description: 'first',
        check: () => ({ failures: [{ id: 'one.failure', message: 'first failure' }] })
      },
      {
        id: 'two',
        description: 'second',
        check: () => ({ failures: [{ id: 'two.failure', message: 'second failure' }] })
      }
    ];

    const result = new RuleRunner(rules).run({ repoRoot: '.', changedFiles: [] });
    expect(result.failures.map((failure) => failure.id)).toEqual(['one.failure', 'two.failure']);
  });

  it('PlanGenerator converts findings to structured tasks', () => {
    const planner = new PlanGenerator();
    const plan = planner.generate([{ id: 'PB001', message: 'missing docs', evidence: 'docs/ARCHITECTURE.md', fix: 'update architecture docs' }]);

    expect(plan.tasks).toEqual([
      {
        id: 'task-1',
        ruleId: 'PB001',
        action: 'update architecture docs',
        file: 'docs/ARCHITECTURE.md',
        fix: 'update architecture docs'
      }
    ]);
  });

  it('FixExecutor applies known handlers and skips unknown tasks', async () => {
    const executor = new FixExecutor({
      known: async () => ({ filesChanged: ['docs/PLAYBOOK_NOTES.md'], summary: 'updated notes' })
    });

    const result = await executor.apply(
      [
        { id: 'task-1', ruleId: 'known', action: 'apply known fix' },
        { id: 'task-2', ruleId: 'unknown', action: 'apply unknown fix' }
      ],
      { repoRoot: '.', dryRun: false }
    );

    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.ruleId).toBe('known');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.ruleId).toBe('unknown');
  });
});
