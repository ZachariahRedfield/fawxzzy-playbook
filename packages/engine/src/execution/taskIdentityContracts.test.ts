import { describe, expect, it } from 'vitest';
import { FixExecutor, HandlerResolver } from './fixExecutor.js';
import { parsePlanArtifact } from './index.js';
import { PlanGenerator } from './planGenerator.js';
import type { FixHandler, PlanTask, RuleFailure } from './types.js';

const createFindings = (): RuleFailure[] => [
  { id: 'rule.z', message: 'z message', evidence: 'b/file.ts' },
  { id: 'rule.a', message: 'a message', evidence: 'a/file.ts', fix: 'fix a' },
  { id: 'rule.z', message: 'z message', evidence: 'b/file.ts' }
];

describe('plan task identity contract hardening', () => {
  it('keeps semantic task ids stable across reordered equivalent findings', () => {
    const generator = new PlanGenerator({ enableOutcomeLearning: false });
    const first = generator.generate(createFindings()).tasks;
    const second = generator.generate([...createFindings()].reverse()).tasks;

    const summarize = (tasks: PlanTask[]): string[] =>
      tasks
        .map((task) => `${task.ruleId}|${task.file ?? ''}|${task.action}|${task.id}`)
        .sort((left, right) => left.localeCompare(right));

    expect(summarize(first)).toEqual(summarize(second));
  });

  it('accepts legacy plan artifacts without taskIdSchemaVersion and rejects unsupported versions clearly', () => {
    expect(() =>
      parsePlanArtifact({
        schemaVersion: '1.0',
        command: 'plan',
        tasks: [{ id: 'task-abcdef0123-1', ruleId: 'rule.one', file: null, action: 'act', autoFix: true }]
      })
    ).not.toThrow();

    expect(() =>
      parsePlanArtifact({
        schemaVersion: '1.0',
        taskIdSchemaVersion: '2.0',
        command: 'plan',
        tasks: [{ id: 'task-abcdef0123-1', ruleId: 'rule.one', file: null, action: 'act', autoFix: true }]
      })
    ).toThrow('Unsupported plan taskIdSchemaVersion: 2.0. Expected "1.0".');
  });
});

describe('fix executor handler resolution evidence', () => {
  it('records explicit unsupported handler resolution details', async () => {
    const executor = new FixExecutor(new HandlerResolver({ builtIn: {} }));
    const result = await executor.apply([{ id: 'task-abcdef0123-1', ruleId: 'rule.missing', file: null, action: 'fix', autoFix: true }], {
      repoRoot: process.cwd(),
      dryRun: false
    });

    expect(result.results[0]?.status).toBe('unsupported');
    expect(result.results[0]?.details).toEqual({
      handler_resolution: 'missing',
      expected_rule_id: 'rule.missing'
    });
  });

  it('records explicit failed handler provenance details', async () => {
    const failingHandler: FixHandler = async () => {
      throw new Error('boom');
    };
    const executor = new FixExecutor(new HandlerResolver({ builtIn: { 'rule.fail': failingHandler } }));
    const result = await executor.apply([{ id: 'task-abcdef0123-1', ruleId: 'rule.fail', file: null, action: 'fix', autoFix: true }], {
      repoRoot: process.cwd(),
      dryRun: false
    });

    expect(result.results[0]?.status).toBe('failed');
    expect(result.results[0]?.details).toEqual({
      handler_resolution: 'resolved',
      handler_source: 'builtin',
      handler_id: 'rule.fail'
    });
  });
});
