import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  PATTERN_TRANSFER_PACKAGE_SCHEMA_VERSION,
  normalizePatternTransferPackage,
  type PatternTransferCompatibilityStatus,
  type PatternTransferKnownFailureMode,
  type PatternTransferPackage,
  type PatternTransferRiskClass,
  type PatternTransferSanitizationStatus
} from '@zachariahredfield/playbook-core';
import { PATTERN_CANDIDATES_RELATIVE_PATH } from './extract/patternCandidates.js';
import { readCanonicalPatternsArtifact, type PromotedPatternRecord } from './promotion.js';

export { PATTERN_TRANSFER_PACKAGE_SCHEMA_VERSION };
export const PATTERN_TRANSFER_PACKAGES_RELATIVE_DIR = '.playbook/pattern-transfer-packages' as const;

type ImportedPatternCandidatesArtifact = {
  schemaVersion: '1.0';
  kind: 'pattern-candidates';
  generatedAt: string;
  candidates: Array<Record<string, unknown>>;
};

export type PatternTransferImportResult = {
  schemaVersion: '1.0';
  command: 'patterns.transfer.import';
  package_id: string;
  outcome: 'imported';
  candidate_only: true;
  candidate_id: string;
  artifact_path: typeof PATTERN_CANDIDATES_RELATIVE_PATH;
  import_governance: {
    review_status: 'pending-local-review';
    local_truth_updated: false;
    execution_planning_effect: 'none';
  };
  package: PatternTransferPackage<PromotedPatternRecord>;
};

const stableStringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const slugify = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pattern';
const uniqueSorted = (values: string[]): string[] => [...new Set(values.filter((v) => v.trim().length > 0))].sort((a, b) => a.localeCompare(b));
const fingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const readJson = <T>(targetPath: string): T => JSON.parse(fs.readFileSync(targetPath, 'utf8')) as T;

const readPatternCandidates = (cwd: string): ImportedPatternCandidatesArtifact => {
  const targetPath = path.join(cwd, PATTERN_CANDIDATES_RELATIVE_PATH);
  if (!fs.existsSync(targetPath)) {
    return { schemaVersion: '1.0', kind: 'pattern-candidates', generatedAt: new Date(0).toISOString(), candidates: [] };
  }
  return readJson(targetPath);
};

const toKnownFailureModes = (pattern: PromotedPatternRecord, riskClass: PatternTransferRiskClass): PatternTransferKnownFailureMode[] => {
  const knownModes = uniqueSorted(pattern.known_failure_modes ?? []);
  if (knownModes.length === 0) {
    return [{ id: `${slugify(pattern.id)}-no-known-failure-modes`, summary: 'No documented transfer failure modes yet.', severity: riskClass, mitigation: 'Keep import candidate-only until local review completes.' }];
  }

  return knownModes.map((summary) => ({
    id: `${slugify(pattern.id)}:${slugify(summary)}`,
    summary,
    severity: riskClass,
    mitigation: 'Use recall/demotion lifecycle hooks if the imported candidate proves unsafe or incompatible.'
  }));
};

export const exportPatternTransferPackage = (input: {
  playbookHome: string;
  patternId: string;
  targetRepoId: string;
  targetTags?: string[];
  sanitizationStatus: PatternTransferSanitizationStatus;
  riskClass: PatternTransferRiskClass;
  compatibilityStatus?: PatternTransferCompatibilityStatus;
  compatibilityReason?: string;
  exportedAt?: string;
}): { packagePath: string; package: PatternTransferPackage<PromotedPatternRecord> } => {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const artifact = readCanonicalPatternsArtifact(input.playbookHome);
  const pattern = artifact.patterns.find((entry) => entry.id === input.patternId);
  if (!pattern) throw new Error(`playbook patterns transfer export: promoted pattern not found: ${input.patternId}`);
  if (pattern.status !== 'active') throw new Error(`playbook patterns transfer export: only active patterns may be transferred; received ${pattern.status}`);

  const requiredTargetTags = uniqueSorted(pattern.compatibility?.required_tags ?? []);
  const targetTags = uniqueSorted(input.targetTags ?? []);
  const compatibilityStatus = input.compatibilityStatus
    ?? (requiredTargetTags.every((tag) => targetTags.includes(tag)) ? 'compatible' : 'review-required');
  const compatibilityNotes = [
    'Cross-repo transfer moves governed packages, not auto-enforced truth.',
    'Receiving repo must review imported package before any local adoption or promotion.',
    ...(requiredTargetTags.length > 0 ? [`Required target tags: ${requiredTargetTags.join(', ')}`] : ['No explicit target tags required by source pattern.'])
  ];

  const pkg = normalizePatternTransferPackage<PromotedPatternRecord>({
    schemaVersion: PATTERN_TRANSFER_PACKAGE_SCHEMA_VERSION,
    kind: 'pattern-transfer-package',
    package_id: `pattern-transfer:${slugify(pattern.id)}:${fingerprint([pattern.id, exportedAt, input.targetRepoId]).slice(0, 12)}`,
    exported_at: exportedAt,
    pattern,
    provenance: {
      source_pattern_id: pattern.id,
      source_pattern_status: pattern.status,
      source_candidate_id: pattern.provenance.candidate_id,
      source_ref: pattern.provenance.source_ref,
      source_fingerprint: pattern.provenance.candidate_fingerprint,
      source_artifact_path: pattern.source_artifact,
      exported_by: 'playbook'
    },
    sanitization: {
      status: input.sanitizationStatus,
      reviewed_at: input.sanitizationStatus === 'sanitized' ? exportedAt : null,
      notes: input.sanitizationStatus === 'sanitized'
        ? ['Sanitization reviewed before transfer.']
        : ['Transfer requires receiving-side review before local adoption.']
    },
    compatibility: {
      status: compatibilityStatus,
      target_repo_id: input.targetRepoId,
      target_tags: targetTags,
      required_target_tags: requiredTargetTags,
      compatibility_notes: compatibilityNotes,
      failure_reason: compatibilityStatus === 'compatible'
        ? null
        : input.compatibilityReason ?? 'Compatibility review not yet satisfied; import must fail closed until resolved.',
      review_required: true,
      fail_closed: true
    },
    governance_boundary: {
      import_mode: 'candidate-only',
      candidate_artifact_path: PATTERN_CANDIDATES_RELATIVE_PATH,
      local_truth_artifact_path: '.playbook/patterns.json',
      execution_planning_effect: 'none',
      review_required: true
    },
    risk_class: input.riskClass,
    known_failure_modes: toKnownFailureModes(pattern, input.riskClass),
    lifecycle_hooks: {
      source_pattern_ref: `global/patterns/${pattern.id}`,
      recall_supported: true,
      demotion_supported: true,
      source_status_at_export: pattern.status
    }
  });

  const packagePath = path.join(input.playbookHome, PATTERN_TRANSFER_PACKAGES_RELATIVE_DIR, `${pkg.package_id}.json`);
  fs.mkdirSync(path.dirname(packagePath), { recursive: true });
  fs.writeFileSync(packagePath, stableStringify(pkg), 'utf8');
  return { packagePath, package: pkg };
};

export const importPatternTransferPackage = (cwd: string, packagePath: string, repoId: string, repoTags: string[] = []): PatternTransferImportResult => {
  const pkg = normalizePatternTransferPackage(readJson<PatternTransferPackage<PromotedPatternRecord>>(packagePath));
  if (pkg.kind !== 'pattern-transfer-package') throw new Error('playbook patterns transfer import: invalid package kind');
  if (pkg.compatibility.status !== 'compatible') throw new Error(`playbook patterns transfer import: compatibility mismatch fails closed for ${pkg.package_id}`);
  if (pkg.compatibility.target_repo_id !== repoId) throw new Error(`playbook patterns transfer import: package targets ${pkg.compatibility.target_repo_id}, not ${repoId}`);

  const normalizedRepoTags = uniqueSorted(repoTags);
  if (pkg.compatibility.required_target_tags.some((tag) => !normalizedRepoTags.includes(tag))) {
    throw new Error(`playbook patterns transfer import: compatibility mismatch fails closed for ${pkg.package_id}; missing required tags`);
  }

  const current = readPatternCandidates(cwd);
  const candidate_id = `imported-${slugify(pkg.pattern.pattern_family)}-${slugify(repoId)}`;
  const candidate = {
    id: candidate_id,
    pattern_family: pkg.pattern.pattern_family,
    title: pkg.pattern.title,
    description: pkg.pattern.description,
    storySeed: pkg.pattern.storySeed,
    source_artifact: packagePath,
    signals: uniqueSorted(pkg.pattern.signals ?? []),
    confidence: pkg.pattern.confidence,
    evidence_refs: uniqueSorted([...pkg.pattern.evidence_refs, pkg.provenance.source_ref]),
    status: 'observed',
    imported_from: {
      package_id: pkg.package_id,
      repo_id: repoId,
      candidate_only: true,
      review_status: 'pending-local-review',
      sanitization_status: pkg.sanitization.status,
      compatibility_status: pkg.compatibility.status,
      execution_planning_effect: pkg.governance_boundary.execution_planning_effect,
      risk_class: pkg.risk_class,
      known_failure_modes: pkg.known_failure_modes,
      lifecycle_hooks: pkg.lifecycle_hooks
    }
  };

  const next = {
    ...current,
    generatedAt: new Date().toISOString(),
    candidates: [...current.candidates.filter((entry) => String(entry.id ?? '') !== candidate_id), candidate]
      .sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))
  };
  const targetPath = path.join(cwd, PATTERN_CANDIDATES_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, stableStringify(next), 'utf8');
  return {
    schemaVersion: '1.0',
    command: 'patterns.transfer.import',
    package_id: pkg.package_id,
    outcome: 'imported',
    candidate_only: true,
    candidate_id,
    artifact_path: PATTERN_CANDIDATES_RELATIVE_PATH,
    import_governance: {
      review_status: 'pending-local-review',
      local_truth_updated: false,
      execution_planning_effect: 'none'
    },
    package: pkg
  };
};
