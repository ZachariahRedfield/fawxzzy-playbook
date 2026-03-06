import { describe, expect, it } from 'vitest';
import {
  buildPlanRemediation,
  parsePlanRemediation,
  remediationToApplyPrecondition
} from './remediationContract.js';

describe('remediationContract', () => {
  it('builds ready remediation when failures have tasks', () => {
    expect(buildPlanRemediation(2, 1)).toEqual({
      status: 'ready',
      totalSteps: 1,
      unresolvedFailures: 1
    });
  });

  it('builds not_needed remediation when no failures are present', () => {
    expect(buildPlanRemediation(0, 0)).toEqual({
      status: 'not_needed',
      totalSteps: 0,
      unresolvedFailures: 0,
      reason: 'No verify failures were detected.'
    });
  });

  it('builds unavailable remediation when failures have no tasks', () => {
    expect(buildPlanRemediation(2, 0)).toEqual({
      status: 'unavailable',
      totalSteps: 0,
      unresolvedFailures: 2,
      reason: 'Verify failures were detected but no remediation tasks are currently available.'
    });
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
});
