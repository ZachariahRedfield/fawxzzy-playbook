import { describe, expect, it } from 'vitest';
import {
  buildPlanRemediation,
  deriveVerifyFailureFacts,
  parsePlanRemediation,
  remediationToApplyPrecondition
} from './remediationContract.js';

describe('remediationContract', () => {
  it('builds ready remediation when failures have tasks', () => {
    expect(buildPlanRemediation({ failureCount: 2, stepCount: 1 })).toEqual({
      status: 'ready',
      totalSteps: 1,
      unresolvedFailures: 1
    });
  });

  it('builds not_needed remediation when no failures are present', () => {
    expect(buildPlanRemediation({ failureCount: 0, stepCount: 0 })).toEqual({
      status: 'not_needed',
      totalSteps: 0,
      unresolvedFailures: 0,
      reason: 'No verify failures were detected.'
    });
  });

  it('builds unavailable remediation when failures have no tasks', () => {
    expect(buildPlanRemediation({ failureCount: 2, stepCount: 0 })).toEqual({
      status: 'unavailable',
      totalSteps: 0,
      unresolvedFailures: 2,
      reason: 'Verify failures were detected but no remediation tasks are currently available.'
    });
  });

  it('never reports not_needed when failures exist without deterministic steps', () => {
    expect(buildPlanRemediation({ failureCount: 1, stepCount: 0 }).status).toBe('unavailable');
  });

  it('parses remediation status object deterministically', () => {
    const remediation = parsePlanRemediation({
      status: 'ready',
      totalSteps: 2,
      unresolvedFailures: 0
    });

    expect(remediationToApplyPrecondition(remediation)).toEqual({
      action: 'proceed',
      message: 'Plan remediation is ready. Applying available tasks.'
    });
  });

  it('rejects unknown remediation statuses', () => {
    expect(() =>
      parsePlanRemediation({
        status: 'maybe',
        totalSteps: 2,
        unresolvedFailures: 0
      })
    ).toThrow('Plan JSON contract has invalid remediation.status.');
  });

  it('derives failure count from verify payload shape', () => {
    expect(
      deriveVerifyFailureFacts({
        failures: [{ id: 'f-1' }],
        summary: { failures: 0, warnings: 3 }
      })
    ).toEqual({
      failureCount: 1,
      sources: ['failures.length', 'summary.failures']
    });
  });

  it('does not treat warnings as remediable failures', () => {
    expect(
      deriveVerifyFailureFacts({
        warnings: [{ id: 'w-1' }],
        summary: { failures: 0, warnings: 1 }
      })
    ).toEqual({
      failureCount: 0,
      sources: ['summary.failures']
    });
  });

  it('derives failure count from findings levels when failures array is absent', () => {
    expect(
      deriveVerifyFailureFacts({
        findings: [
          { id: 'f-1', level: 'failure' },
          { id: 'w-1', level: 'warning' },
          { id: 'e-1', level: 'error' }
        ]
      })
    ).toEqual({
      failureCount: 2,
      sources: ['findings[level=failure|error].length']
    });
  });
});
