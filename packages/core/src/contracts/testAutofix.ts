export const TEST_AUTOFIX_SCHEMA_VERSION = '1.0' as const;
export const TEST_AUTOFIX_ARTIFACT_KIND = 'test-autofix' as const;

export const testAutofixFinalStatuses = [
  'fixed',
  'partially_fixed',
  'not_fixed',
  'blocked',
  'blocked_low_confidence',
  'review_required_only'
] as const;
export type TestAutofixFinalStatus = (typeof testAutofixFinalStatuses)[number];

export type TestAutofixSourceReference = {
  path: string | null;
  command: 'test-triage' | 'test-fix-plan' | 'apply';
};

export type TestAutofixApplySummary = {
  attempted: boolean;
  ok: boolean;
  exitCode: number;
  applied: number;
  skipped: number;
  unsupported: number;
  failed: number;
  message: string | null;
};

export type TestAutofixVerificationCommandResult = {
  command: string;
  exitCode: number;
  ok: boolean;
};

export type TestAutofixVerificationSummary = {
  attempted: boolean;
  ok: boolean;
  total: number;
  passed: number;
  failed: number;
};

export type TestAutofixExcludedFindingSummary = {
  total: number;
  review_required: number;
  by_reason: Array<{
    reason: string;
    count: number;
  }>;
};

export const testAutofixRetryPolicyDecisions = [
  'allow_repair',
  'allow_with_preferred_repair_class',
  'blocked_repeat_failure',
  'review_required_repeat_failure',
  'no_history'
] as const;
export type TestAutofixRetryPolicyDecision = (typeof testAutofixRetryPolicyDecisions)[number];


export const testAutofixModes = ['dry_run', 'apply'] as const;
export type TestAutofixMode = (typeof testAutofixModes)[number];

export type TestAutofixConfidenceDetails = {
  autofix_confidence: number;
  confidence_reasoning: string[];
};

export type TestAutofixHistorySummary = {
  matched_signatures: string[];
  matching_run_ids: string[];
  prior_final_statuses: string[];
  prior_applied_repair_classes: string[];
  prior_successful_repair_classes: string[];
  repeated_failed_repair_attempts: Array<{
    failure_signature: string;
    repair_class: string;
    count: number;
    run_ids: string[];
  }>;
  provenance_run_ids: string[];
};

export type TestAutofixArtifact = {
  schemaVersion: typeof TEST_AUTOFIX_SCHEMA_VERSION;
  kind: typeof TEST_AUTOFIX_ARTIFACT_KIND;
  command: 'test-autofix';
  generatedAt: string;
  run_id: string;
  input: string;
  source_triage: TestAutofixSourceReference;
  source_fix_plan: TestAutofixSourceReference;
  source_apply: TestAutofixSourceReference;
  remediation_history_path: string;
  mode: TestAutofixMode;
  would_apply: boolean;
  confidence_threshold: number;
  failure_signatures: string[];
  history_summary: TestAutofixHistorySummary;
  preferred_repair_class: string | null;
  autofix_confidence: number;
  confidence_reasoning: string[];
  retry_policy_decision: TestAutofixRetryPolicyDecision;
  retry_policy_reason: string;
  apply_result: TestAutofixApplySummary;
  verification_result: TestAutofixVerificationSummary;
  executed_verification_commands: TestAutofixVerificationCommandResult[];
  applied_task_ids: string[];
  excluded_finding_summary: TestAutofixExcludedFindingSummary;
  final_status: TestAutofixFinalStatus;
  stop_reasons: string[];
  reason: string;
};
