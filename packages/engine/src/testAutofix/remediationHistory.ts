import type {
  TestAutofixConfidenceDetails,
  TestAutofixRemediationClassification,
  TestAutofixRemediationHistoryArtifact,
  TestAutofixRemediationHistoryEntry,
  TestAutofixHistorySummary,
  TestAutofixRetryPolicyDecision,
  TestFixPlanArtifact,
  TestTriageArtifact
} from '@zachariahredfield/playbook-core';
import {
  TEST_AUTOFIX_REMEDIATION_HISTORY_ARTIFACT_KIND,
  TEST_AUTOFIX_REMEDIATION_HISTORY_SCHEMA_VERSION
} from '@zachariahredfield/playbook-core';

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const uniqueSorted = (values: Array<string | null | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.trim()).filter(Boolean))].sort(compareStrings);
const MAX_AUTOFIX_CONFIDENCE = 0.95;
const clampConfidence = (value: number): number => Math.max(0, Math.min(MAX_AUTOFIX_CONFIDENCE, Number(value.toFixed(2))));

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
  listRunsByFailureSignature(artifact, failureSignature).filter((entry) => entry.final_status === 'blocked' || entry.final_status === 'blocked_low_confidence' || entry.final_status === 'not_fixed');

const DEFAULT_FAILED_REPEAT_THRESHOLD = 2;

type RetryPolicyEvaluation = {
  failure_signatures: string[];
  history_summary: TestAutofixHistorySummary;
  preferred_repair_class: string | null;
  retry_policy_decision: TestAutofixRetryPolicyDecision;
  retry_policy_reason: string;
};

export const evaluateRepeatRemediationPolicy = (
  triage: TestTriageArtifact,
  fixPlan: TestFixPlanArtifact,
  history: TestAutofixRemediationHistoryArtifact,
  failedAttemptThreshold = DEFAULT_FAILED_REPEAT_THRESHOLD
): RetryPolicyEvaluation => {
  const failureSignatures = uniqueSorted(triage.findings.map((finding) => finding.failure_signature));
  const currentRepairClasses = uniqueSorted(fixPlan.tasks.map((task) => task.task_kind));
  const matchingRuns = uniqueSorted(failureSignatures.flatMap((signature) => listRunsByFailureSignature(history, signature).map((entry) => entry.run_id)));
  const matchingEntries = history.runs.filter((entry) => matchingRuns.includes(entry.run_id));

  const repeatedFailedRepairAttempts = failureSignatures.flatMap((failureSignature) => {
    const failedEntries = listRepeatedFailedRepairAttempts(history, failureSignature);
    return currentRepairClasses.map((repairClass) => {
      const runIds = uniqueSorted(failedEntries.filter((entry) => entry.applied_repair_classes.includes(repairClass)).map((entry) => entry.run_id));
      return {
        failure_signature: failureSignature,
        repair_class: repairClass,
        count: runIds.length,
        run_ids: runIds
      };
    });
  }).filter((entry) => entry.count > 0).sort((left, right) => {
    const signatureOrder = compareStrings(left.failure_signature, right.failure_signature);
    if (signatureOrder !== 0) return signatureOrder;
    return compareStrings(left.repair_class, right.repair_class);
  });

  const historySummary: TestAutofixHistorySummary = {
    matched_signatures: uniqueSorted(failureSignatures.filter((signature) => listRunsByFailureSignature(history, signature).length > 0)),
    matching_run_ids: matchingRuns,
    prior_final_statuses: uniqueSorted(matchingEntries.map((entry) => entry.final_status)),
    prior_applied_repair_classes: uniqueSorted(matchingEntries.flatMap((entry) => entry.applied_repair_classes)),
    prior_successful_repair_classes: uniqueSorted(
      matchingEntries
        .filter((entry) => entry.final_status === 'fixed' || entry.final_status === 'partially_fixed')
        .flatMap((entry) => entry.applied_repair_classes)
    ),
    repeated_failed_repair_attempts: repeatedFailedRepairAttempts,
    provenance_run_ids: matchingRuns
  };

  if (historySummary.matching_run_ids.length === 0) {
    return {
      failure_signatures: failureSignatures,
      history_summary: historySummary,
      preferred_repair_class: null,
      retry_policy_decision: 'no_history',
      retry_policy_reason: 'No remediation history matched the stable failure signatures, so one bounded repair attempt is allowed.'
    };
  }

  const blockedAttempt = repeatedFailedRepairAttempts.find((entry) => entry.count >= failedAttemptThreshold);
  if (blockedAttempt) {
    return {
      failure_signatures: failureSignatures,
      history_summary: historySummary,
      preferred_repair_class: null,
      retry_policy_decision: 'blocked_repeat_failure',
      retry_policy_reason: `Repair class ${blockedAttempt.repair_class} already failed ${blockedAttempt.count} times for stable failure signature ${blockedAttempt.failure_signature}, so mutation is blocked before replaying a known-bad repair.`
    };
  }

  const preferredRepairClass = currentRepairClasses.find((repairClass) => historySummary.prior_successful_repair_classes.includes(repairClass)) ?? null;
  if (preferredRepairClass) {
    return {
      failure_signatures: failureSignatures,
      history_summary: historySummary,
      preferred_repair_class: preferredRepairClass,
      retry_policy_decision: 'allow_with_preferred_repair_class',
      retry_policy_reason: `History shows repair class ${preferredRepairClass} previously helped for the same stable failure signature, so one bounded repair attempt is allowed with that preferred guidance.`
    };
  }

  if (currentRepairClasses.length > 1 || historySummary.matched_signatures.length > 1) {
    return {
      failure_signatures: failureSignatures,
      history_summary: historySummary,
      preferred_repair_class: null,
      retry_policy_decision: 'review_required_repeat_failure',
      retry_policy_reason: 'Repeat history exists but does not converge on one preferred repair class for this mixed failure set, so the run escalates for review instead of guessing.'
    };
  }

  return {
    failure_signatures: failureSignatures,
    history_summary: historySummary,
    preferred_repair_class: null,
    retry_policy_decision: 'allow_repair',
    retry_policy_reason: 'Repeat history exists, but no preferred or blocked repair class was identified, so one bounded repair attempt is allowed.'
  };
};

export const computeAutofixConfidence = (options: {
  triage: TestTriageArtifact;
  fixPlan: TestFixPlanArtifact;
  history: TestAutofixRemediationHistoryArtifact;
  retryPolicy: RetryPolicyEvaluation;
}): TestAutofixConfidenceDetails => {
  const reasoning: string[] = [];
  if (options.retryPolicy.retry_policy_decision === 'blocked_repeat_failure') {
    return {
      autofix_confidence: 0,
      confidence_reasoning: ['repeat policy blocked mutation, so deterministic confidence is forced to 0.00']
    };
  }

  let score = 0.25;
  const findingKinds = uniqueSorted(options.triage.findings.map((finding) => finding.failure_kind));
  const preferredKinds = new Set(['snapshot_drift', 'stale_assertion', 'ordering_drift']);
  const allPreferredKinds = findingKinds.length > 0 && findingKinds.every((kind) => preferredKinds.has(kind));
  if (allPreferredKinds) {
    score += 0.35;
    reasoning.push(`failure kinds stayed in preferred deterministic classes (${findingKinds.join(', ')}), boosting confidence.`);
  } else {
    score += 0.1;
    reasoning.push(`failure kinds included less-certain classes (${findingKinds.join(', ') || 'none'}), keeping confidence conservative.`);
  }

  if (options.retryPolicy.history_summary.prior_successful_repair_classes.length > 0) {
    score += 0.2;
    reasoning.push(`history contains prior successful repair classes (${options.retryPolicy.history_summary.prior_successful_repair_classes.join(', ')}), boosting confidence.`);
  }

  const repeatedFailures = options.retryPolicy.history_summary.repeated_failed_repair_attempts.reduce((sum, entry) => sum + entry.count, 0);
  if (repeatedFailures > 0) {
    score -= Math.min(0.3, repeatedFailures * 0.1);
    reasoning.push(`history recorded ${repeatedFailures} repeated failed repair attempt(s), reducing confidence.`);
  }

  const totalFindings = options.fixPlan.tasks.length + options.fixPlan.excluded.length;
  const exclusionRatio = totalFindings === 0 ? 1 : options.fixPlan.excluded.length / totalFindings;
  score += (1 - exclusionRatio) * 0.15;
  reasoning.push(`excluded finding ratio was ${options.fixPlan.excluded.length}/${totalFindings || 1}, so fewer exclusions raise confidence.`);

  if (options.retryPolicy.retry_policy_decision === 'allow_with_preferred_repair_class') {
    score += 0.1;
    reasoning.push('repeat policy identified a preferred repair class, adding a bounded confidence boost.');
  } else if (options.retryPolicy.retry_policy_decision === 'review_required_repeat_failure') {
    score -= 0.15;
    reasoning.push('repeat policy escalated mixed history for review, reducing confidence.');
  }

  return {
    autofix_confidence: clampConfidence(score),
    confidence_reasoning: reasoning.sort(compareStrings)
  };
};
