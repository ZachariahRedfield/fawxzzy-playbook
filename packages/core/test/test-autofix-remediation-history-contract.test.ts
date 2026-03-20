import { describe, expect, it } from 'vitest';
import {
  TEST_AUTOFIX_REMEDIATION_HISTORY_ARTIFACT_KIND,
  TEST_AUTOFIX_REMEDIATION_HISTORY_SCHEMA_VERSION
} from '../src/contracts/testAutofixRemediationHistory.js';

describe('test-autofix remediation history contract constants', () => {
  it('exports stable schema metadata', () => {
    expect(TEST_AUTOFIX_REMEDIATION_HISTORY_SCHEMA_VERSION).toBe('1.0');
    expect(TEST_AUTOFIX_REMEDIATION_HISTORY_ARTIFACT_KIND).toBe('test-autofix-remediation-history');
  });
});
