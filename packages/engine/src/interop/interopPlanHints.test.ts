import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileInteropFollowups } from './interopFollowups.js';
import { compileInteropPlanHints } from './interopPlanHints.js';
import type { InteropUpdatedTruthArtifact } from './playbookLifelineInterop.js';

const createRepo = (name: string): string => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
  return repo;
};

const writeUpdatedTruth = (repo: string, updates: InteropUpdatedTruthArtifact['updates']): void => {
  const artifact: InteropUpdatedTruthArtifact = {
    schemaVersion: '1.0',
    kind: 'interop-updated-truth-artifact',
    contract: {
      sourceHash: 'fitness-contract-hash',
      sourceRef: 'main',
      sourcePath: 'fawxzzy-fitness/src/lib/ecosystem/fitness-integration-contract.ts'
    },
    updates
  };
  fs.writeFileSync(path.join(repo, '.playbook', 'interop-updated-truth.json'), `${JSON.stringify(artifact, null, 2)}\n`);
};

describe('compileInteropPlanHints', () => {
  it('materializes deterministic next-plan hints from actionable bounded outcomes only', () => {
    const repo = createRepo('playbook-engine-interop-plan-hints');
    writeUpdatedTruth(repo, [
      {
        receiptId: 'receipt-a',
        requestId: 'request-a',
        action: 'adjust_upcoming_workout_load',
        receiptType: 'schedule_adjustment_applied',
        sourceHash: 'fitness-contract-hash',
        canonicalOutcomeSummary: { outcome: 'blocked', detail: 'Blocked by policy guard.', completedAt: '2026-03-30T00:00:00.000Z' },
        boundedStateDelta: { requestState: 'blocked', outputArtifactPath: null, outputSha256: null },
        memoryProvenanceRefs: ['.playbook/lifeline-interop-runtime.json'],
        nextActionHints: ['Review policy assumptions before retrying.']
      },
      {
        receiptId: 'receipt-b',
        requestId: 'request-b',
        action: 'adjust_upcoming_workout_load',
        receiptType: 'schedule_adjustment_applied',
        sourceHash: 'fitness-contract-hash',
        canonicalOutcomeSummary: { outcome: 'blocked', detail: 'Blocked repeatedly by policy guard.', completedAt: '2026-03-30T00:05:00.000Z' },
        boundedStateDelta: { requestState: 'blocked', outputArtifactPath: null, outputSha256: null },
        memoryProvenanceRefs: ['.playbook/lifeline-interop-runtime.json'],
        nextActionHints: ['Need explicit unblock plan step.']
      },
      {
        receiptId: 'receipt-c',
        requestId: 'request-c',
        action: 'schedule_recovery_block',
        receiptType: 'recovery_guardrail_applied',
        sourceHash: 'fitness-contract-hash',
        canonicalOutcomeSummary: { outcome: 'failed', detail: 'Runtime transport error.', completedAt: '2026-03-30T00:10:00.000Z' },
        boundedStateDelta: { requestState: 'failed', outputArtifactPath: null, outputSha256: null },
        memoryProvenanceRefs: ['.playbook/lifeline-interop-runtime.json'],
        nextActionHints: ['Inspect bounded retry parameters.']
      },
      {
        receiptId: 'receipt-d',
        requestId: 'request-d',
        action: 'schedule_recovery_block',
        receiptType: 'recovery_guardrail_applied',
        sourceHash: 'fitness-contract-hash',
        canonicalOutcomeSummary: { outcome: 'failed', detail: 'Runtime transport error again.', completedAt: '2026-03-30T00:15:00.000Z' },
        boundedStateDelta: { requestState: 'failed', outputArtifactPath: null, outputSha256: null },
        memoryProvenanceRefs: ['.playbook/lifeline-interop-runtime.json'],
        nextActionHints: ['Bounded retry or recovery planning needed.']
      },
      {
        receiptId: 'receipt-e',
        requestId: 'request-e',
        action: 'revise_weekly_goal_plan',
        receiptType: 'goal_plan_amended',
        sourceHash: 'fitness-contract-hash',
        canonicalOutcomeSummary: { outcome: 'completed', detail: 'Goal plan amended after readiness review.', completedAt: '2026-03-30T00:20:00.000Z' },
        boundedStateDelta: { requestState: 'completed', outputArtifactPath: '.playbook/rendezvous-manifest.json', outputSha256: 'sha-e' },
        memoryProvenanceRefs: ['.playbook/lifeline-interop-runtime.json'],
        nextActionHints: ['Advance to approved next bounded planning step.']
      },
      {
        receiptId: 'receipt-f',
        requestId: 'request-f',
        action: 'adjust_upcoming_workout_load',
        receiptType: 'schedule_adjustment_applied',
        sourceHash: 'fitness-contract-hash',
        canonicalOutcomeSummary: { outcome: 'failed', detail: 'One-off failure should remain noise-free.', completedAt: '2026-03-30T00:25:00.000Z' },
        boundedStateDelta: { requestState: 'failed', outputArtifactPath: null, outputSha256: null },
        memoryProvenanceRefs: ['.playbook/lifeline-interop-runtime.json'],
        nextActionHints: ['Wait for more evidence before planning changes.']
      }
    ]);

    compileInteropFollowups(repo);
    const first = compileInteropPlanHints(repo);
    const firstRaw = fs.readFileSync(path.join(repo, '.playbook', 'interop-plan-hints.json'), 'utf8');
    const second = compileInteropPlanHints(repo);
    const secondRaw = fs.readFileSync(path.join(repo, '.playbook', 'interop-plan-hints.json'), 'utf8');

    expect(first.artifactPath).toBe('.playbook/interop-plan-hints.json');
    expect(second.artifactPath).toBe('.playbook/interop-plan-hints.json');
    expect(firstRaw).toBe(secondRaw);
    expect(first.planHints.authority).toEqual({ mutation: 'read-only', promotion: 'review-required' });
    expect(first.planHints.hints).toHaveLength(5);
    expect(first.planHints.hints.map((entry) => entry.reasonCode)).toEqual([
      'repeated-blocked-runtime-outcome',
      'repeated-blocked-runtime-outcome',
      'repeated-failed-runtime-outcome',
      'repeated-failed-runtime-outcome',
      'completed-bounded-state-advance'
    ]);
    expect(first.planHints.hints.every((entry) => entry.provenanceRefs.includes('.playbook/interop-followups.json'))).toBe(true);
    expect(first.planHints.hints.find((entry) => entry.receiptId === 'receipt-f')).toBeUndefined();
  });

  it('rejects non-canonical path overrides', () => {
    const repo = createRepo('playbook-engine-interop-plan-hints-paths');
    writeUpdatedTruth(repo, []);
    compileInteropFollowups(repo);

    expect(() => compileInteropPlanHints(repo, { followupsPath: '.playbook/not-followups.json' })).toThrow(/only canonical/);
    expect(() => compileInteropPlanHints(repo, { updatedTruthPath: '.playbook/not-updated-truth.json' })).toThrow(/only canonical/);
    expect(() => compileInteropPlanHints(repo, { artifactPath: '.playbook/not-plan-hints.json' })).toThrow(/only canonical/);
  });
});
