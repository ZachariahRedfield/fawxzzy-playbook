import type {
  TestAutofixRemediationClassification,
  TestAutofixRemediationHistoryArtifact,
  TestAutofixRemediationHistoryEntry
} from '@zachariahredfield/playbook-core';
import {
  TEST_AUTOFIX_REMEDIATION_HISTORY_ARTIFACT_KIND,
  TEST_AUTOFIX_REMEDIATION_HISTORY_SCHEMA_VERSION
} from '@zachariahredfield/playbook-core';

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const uniqueSorted = (values: Array<string | null | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.trim()).filter(Boolean))].sort(compareStrings);

export const createEmptyRemediationHistoryArtifact = (): TestAutofixRemediationHistoryArtifact => ({
  schemaVersion: TEST_AUTOFIX_REMEDIATION_HISTORY_SCHEMA_VERSION,
  kind: TEST_AUTOFIX_REMEDIATION_HISTORY_ARTIFACT_KIND,
  generatedAt: new Date(0).toISOString(),
  runs: []
});

export const normalizeRemediationHistoryArtifact = (value: unknown): TestAutofixRemediationHistoryArtifact => {
  if (!value || typeof value !== 'object') {
    return createEmptyRemediationHistoryArtifact();
  }
  const record = value as Partial<TestAutofixRemediationHistoryArtifact>;
  return {
    schemaVersion: TEST_AUTOFIX_REMEDIATION_HISTORY_SCHEMA_VERSION,
    kind: TEST_AUTOFIX_REMEDIATION_HISTORY_ARTIFACT_KIND,
    generatedAt: new Date(0).toISOString(),
    runs: Array.isArray(record.runs) ? [...record.runs] : []
  };
};

export const nextRemediationHistoryRunId = (artifact: TestAutofixRemediationHistoryArtifact): string => `test-autofix-run-${String(artifact.runs.length + 1).padStart(4, '0')}`;

export const appendRemediationHistoryEntry = (artifact: TestAutofixRemediationHistoryArtifact, entry: TestAutofixRemediationHistoryEntry): TestAutofixRemediationHistoryArtifact => ({
  schemaVersion: TEST_AUTOFIX_REMEDIATION_HISTORY_SCHEMA_VERSION,
  kind: TEST_AUTOFIX_REMEDIATION_HISTORY_ARTIFACT_KIND,
  generatedAt: new Date(0).toISOString(),
  runs: [...artifact.runs, entry]
});

export const buildTriageClassifications = (entries: TestAutofixRemediationClassification[]): TestAutofixRemediationClassification[] => [...entries].sort((left, right) => {
  const signatureOrder = left.failure_signature.localeCompare(right.failure_signature);
  if (signatureOrder !== 0) return signatureOrder;
  const fileOrder = (left.test_file ?? '').localeCompare(right.test_file ?? '');
  if (fileOrder !== 0) return fileOrder;
  return (left.test_name ?? '').localeCompare(right.test_name ?? '');
});

export const listRunsByFailureSignature = (artifact: TestAutofixRemediationHistoryArtifact, failureSignature: string): TestAutofixRemediationHistoryEntry[] => artifact.runs.filter((entry) => entry.failure_signatures.includes(failureSignature));

export const listPriorSuccessfulRepairClasses = (artifact: TestAutofixRemediationHistoryArtifact, failureSignature: string): string[] => uniqueSorted(
  listRunsByFailureSignature(artifact, failureSignature)
    .filter((entry) => entry.final_status === 'fixed' || entry.final_status === 'partially_fixed')
    .flatMap((entry) => entry.applied_repair_classes)
);

export const listRepeatedFailedRepairAttempts = (artifact: TestAutofixRemediationHistoryArtifact, failureSignature: string): TestAutofixRemediationHistoryEntry[] =>
  listRunsByFailureSignature(artifact, failureSignature).filter((entry) => entry.final_status === 'blocked' || entry.final_status === 'not_fixed');
