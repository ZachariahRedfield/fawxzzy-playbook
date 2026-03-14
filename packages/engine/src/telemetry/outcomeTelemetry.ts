export const OUTCOME_TELEMETRY_SCHEMA_VERSION = '1.0';
export const PROCESS_TELEMETRY_SCHEMA_VERSION = '1.0';

export type OutcomeTelemetryRecord = {
  id: string;
  recordedAt: string;
  plan_churn: number;
  apply_retries: number;
  dependency_drift: number;
  contract_breakage: number;
  docs_mismatch: boolean;
  ci_failure_categories: string[];
};

export type OutcomeTelemetrySummary = {
  total_records: number;
  sum_plan_churn: number;
  sum_apply_retries: number;
  sum_dependency_drift: number;
  sum_contract_breakage: number;
  docs_mismatch_count: number;
  ci_failure_category_counts: Record<string, number>;
};

export type OutcomeTelemetryArtifact = {
  schemaVersion: typeof OUTCOME_TELEMETRY_SCHEMA_VERSION;
  kind: 'outcome-telemetry';
  generatedAt: string;
  records: OutcomeTelemetryRecord[];
  summary: OutcomeTelemetrySummary;
};

export type ProcessReasoningScope = 'narrow' | 'module' | 'repository' | 'cross-repo';

export type ProcessTelemetryRecord = {
  id: string;
  recordedAt: string;
  task_family: string;
  task_duration_ms: number;
  files_touched: string[];
  validators_run: string[];
  retry_count: number;
  merge_conflict_risk: number;
  first_pass_success: boolean;
  prompt_size: number;
  reasoning_scope: ProcessReasoningScope;
};

export type ProcessTelemetrySummary = {
  total_records: number;
  total_task_duration_ms: number;
  average_task_duration_ms: number;
  total_retry_count: number;
  first_pass_success_count: number;
  average_merge_conflict_risk: number;
  total_files_touched_unique: number;
  total_validators_run_unique: number;
  task_family_counts: Record<string, number>;
  validators_run_counts: Record<string, number>;
  reasoning_scope_counts: Record<ProcessReasoningScope, number>;
};

export type ProcessTelemetryArtifact = {
  schemaVersion: typeof PROCESS_TELEMETRY_SCHEMA_VERSION;
  kind: 'process-telemetry';
  generatedAt: string;
  records: ProcessTelemetryRecord[];
  summary: ProcessTelemetrySummary;
};

const sortStrings = (values: string[]): string[] => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const sortCountMap = (values: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(values).sort((left, right) => left[0].localeCompare(right[0])));

const compareRecords = <T extends { recordedAt: string; id: string }>(left: T, right: T): number =>
  left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id);

const round4 = (value: number): number => Number(value.toFixed(4));

const normalizeOutcomeRecord = (record: OutcomeTelemetryRecord): OutcomeTelemetryRecord => ({
  ...record,
  ci_failure_categories: sortStrings(record.ci_failure_categories)
});

const normalizeProcessRecord = (record: ProcessTelemetryRecord): ProcessTelemetryRecord => ({
  ...record,
  files_touched: sortStrings(record.files_touched),
  validators_run: sortStrings(record.validators_run),
  merge_conflict_risk: round4(record.merge_conflict_risk)
});

export const summarizeOutcomeTelemetry = (records: OutcomeTelemetryRecord[]): OutcomeTelemetrySummary => {
  const ciFailureCategoryCounts = new Map<string, number>();

  for (const record of records) {
    for (const category of record.ci_failure_categories) {
      ciFailureCategoryCounts.set(category, (ciFailureCategoryCounts.get(category) ?? 0) + 1);
    }
  }

  return {
    total_records: records.length,
    sum_plan_churn: records.reduce((sum, record) => sum + record.plan_churn, 0),
    sum_apply_retries: records.reduce((sum, record) => sum + record.apply_retries, 0),
    sum_dependency_drift: records.reduce((sum, record) => sum + record.dependency_drift, 0),
    sum_contract_breakage: records.reduce((sum, record) => sum + record.contract_breakage, 0),
    docs_mismatch_count: records.filter((record) => record.docs_mismatch).length,
    ci_failure_category_counts: sortCountMap(Object.fromEntries(ciFailureCategoryCounts))
  };
};

export const summarizeProcessTelemetry = (records: ProcessTelemetryRecord[]): ProcessTelemetrySummary => {
  const taskFamilyCounts = new Map<string, number>();
  const validatorsRunCounts = new Map<string, number>();
  const filesTouched = new Set<string>();
  const validatorsTouched = new Set<string>();

  const reasoningScopeCounts: Record<ProcessReasoningScope, number> = {
    narrow: 0,
    module: 0,
    repository: 0,
    'cross-repo': 0
  };

  for (const record of records) {
    taskFamilyCounts.set(record.task_family, (taskFamilyCounts.get(record.task_family) ?? 0) + 1);
    reasoningScopeCounts[record.reasoning_scope] += 1;
    for (const file of record.files_touched) {
      filesTouched.add(file);
    }
    for (const validator of record.validators_run) {
      validatorsTouched.add(validator);
      validatorsRunCounts.set(validator, (validatorsRunCounts.get(validator) ?? 0) + 1);
    }
  }

  const totalTaskDurationMs = records.reduce((sum, record) => sum + record.task_duration_ms, 0);
  const totalRetryCount = records.reduce((sum, record) => sum + record.retry_count, 0);
  const mergeConflictRiskTotal = records.reduce((sum, record) => sum + record.merge_conflict_risk, 0);
  const averageTaskDuration = records.length === 0 ? 0 : totalTaskDurationMs / records.length;
  const averageMergeConflictRisk = records.length === 0 ? 0 : mergeConflictRiskTotal / records.length;

  return {
    total_records: records.length,
    total_task_duration_ms: totalTaskDurationMs,
    average_task_duration_ms: round4(averageTaskDuration),
    total_retry_count: totalRetryCount,
    first_pass_success_count: records.filter((record) => record.first_pass_success).length,
    average_merge_conflict_risk: round4(averageMergeConflictRisk),
    total_files_touched_unique: filesTouched.size,
    total_validators_run_unique: validatorsTouched.size,
    task_family_counts: sortCountMap(Object.fromEntries(taskFamilyCounts)),
    validators_run_counts: sortCountMap(Object.fromEntries(validatorsRunCounts)),
    reasoning_scope_counts: reasoningScopeCounts
  };
};

export const normalizeOutcomeTelemetryArtifact = (artifact: OutcomeTelemetryArtifact): OutcomeTelemetryArtifact => {
  const records = artifact.records.map(normalizeOutcomeRecord).sort(compareRecords);
  return {
    ...artifact,
    records,
    summary: summarizeOutcomeTelemetry(records)
  };
};

export const normalizeProcessTelemetryArtifact = (artifact: ProcessTelemetryArtifact): ProcessTelemetryArtifact => {
  const records = artifact.records.map(normalizeProcessRecord).sort(compareRecords);
  return {
    ...artifact,
    records,
    summary: summarizeProcessTelemetry(records)
  };
};

export const summarizeStructuralTelemetry = (outcomes: OutcomeTelemetryArtifact, process: ProcessTelemetryArtifact) => ({
  schemaVersion: '1.0',
  kind: 'telemetry-summary' as const,
  generatedAt: [outcomes.generatedAt, process.generatedAt].sort((left, right) => right.localeCompare(left))[0] ?? new Date(0).toISOString(),
  outcomes: normalizeOutcomeTelemetryArtifact(outcomes).summary,
  process: normalizeProcessTelemetryArtifact(process).summary
});
