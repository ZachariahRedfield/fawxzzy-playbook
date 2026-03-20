export const PATTERN_TRANSFER_PACKAGE_SCHEMA_VERSION = '1.0' as const;

export const patternTransferRiskClasses = ['low', 'medium', 'high', 'critical'] as const;
export type PatternTransferRiskClass = (typeof patternTransferRiskClasses)[number];

export const patternTransferSanitizationStatuses = ['sanitized', 'unsanitized', 'needs-review'] as const;
export type PatternTransferSanitizationStatus = (typeof patternTransferSanitizationStatuses)[number];

export const patternTransferCompatibilityStatuses = ['compatible', 'incompatible', 'review-required'] as const;
export type PatternTransferCompatibilityStatus = (typeof patternTransferCompatibilityStatuses)[number];

export type PatternTransferKnownFailureMode = {
  id: string;
  summary: string;
  severity: PatternTransferRiskClass;
  mitigation: string | null;
};

export type PatternTransferProvenance = {
  source_pattern_id: string;
  source_pattern_status: 'active' | 'superseded' | 'retired' | 'demoted';
  source_candidate_id: string;
  source_ref: string;
  source_fingerprint: string;
  source_artifact_path: string;
  exported_by: 'playbook';
};

export type PatternTransferCompatibilityMetadata = {
  status: PatternTransferCompatibilityStatus;
  target_repo_id: string;
  target_tags: string[];
  required_target_tags: string[];
  compatibility_notes: string[];
  failure_reason: string | null;
  review_required: boolean;
  fail_closed: boolean;
};

export type PatternTransferGovernanceBoundary = {
  import_mode: 'candidate-only';
  candidate_artifact_path: '.playbook/pattern-candidates.json';
  local_truth_artifact_path: '.playbook/patterns.json';
  execution_planning_effect: 'none';
  review_required: true;
};

export type PatternTransferLifecycleHooks = {
  source_pattern_ref: `global/patterns/${string}`;
  recall_supported: boolean;
  demotion_supported: boolean;
  source_status_at_export: 'active' | 'superseded' | 'retired' | 'demoted';
};

export type PatternTransferPackage<TPattern = Record<string, unknown>> = {
  schemaVersion: typeof PATTERN_TRANSFER_PACKAGE_SCHEMA_VERSION;
  kind: 'pattern-transfer-package';
  package_id: string;
  exported_at: string;
  pattern: TPattern;
  provenance: PatternTransferProvenance;
  sanitization: {
    status: PatternTransferSanitizationStatus;
    reviewed_at: string | null;
    notes: string[];
  };
  compatibility: PatternTransferCompatibilityMetadata;
  governance_boundary: PatternTransferGovernanceBoundary;
  risk_class: PatternTransferRiskClass;
  known_failure_modes: PatternTransferKnownFailureMode[];
  lifecycle_hooks: PatternTransferLifecycleHooks;
};

const uniqueSorted = (values: string[] | undefined): string[] =>
  [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));

export const normalizePatternTransferPackage = <TPattern = Record<string, unknown>>(
  pkg: PatternTransferPackage<TPattern>
): PatternTransferPackage<TPattern> => ({
  ...pkg,
  sanitization: {
    ...pkg.sanitization,
    notes: uniqueSorted(pkg.sanitization.notes)
  },
  compatibility: {
    ...pkg.compatibility,
    target_tags: uniqueSorted(pkg.compatibility.target_tags),
    required_target_tags: uniqueSorted(pkg.compatibility.required_target_tags),
    compatibility_notes: uniqueSorted(pkg.compatibility.compatibility_notes),
    failure_reason: pkg.compatibility.failure_reason ?? null
  },
  known_failure_modes: [...pkg.known_failure_modes]
    .map((mode) => ({
      ...mode,
      mitigation: mode.mitigation ?? null
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
});
