import path from 'node:path';
import type {
  PortabilityAdoptionStatus,
  PortabilityDecisionStatus,
  PortabilityObservedOutcome,
  PortabilityOutcomeTelemetryRecord
} from '@zachariahredfield/playbook-core';
import { readJsonIfExists, writeDeterministicJsonAtomic } from './io.js';

export const PORTABILITY_OUTCOMES_SCHEMA_VERSION = '1.0' as const;
export const PORTABILITY_OUTCOMES_RELATIVE_PATH = '.playbook/portability-outcomes.json' as const;

export type PortabilityOutcomesArtifact = {
  schemaVersion: typeof PORTABILITY_OUTCOMES_SCHEMA_VERSION;
  kind: 'portability-outcomes';
  generatedAt: string;
  outcomes: PortabilityOutcomeTelemetryRecord[];
};

export type PortabilityOutcomeLookup = {
  pattern_id?: string;
  source_repo?: string;
  target_repo?: string;
  decision_status?: PortabilityDecisionStatus;
};

const round4 = (value: number): number => Number(value.toFixed(4));

const compareOutcomes = (left: PortabilityOutcomeTelemetryRecord, right: PortabilityOutcomeTelemetryRecord): number =>
  left.timestamp.localeCompare(right.timestamp) ||
  left.recommendation_id.localeCompare(right.recommendation_id) ||
  left.pattern_id.localeCompare(right.pattern_id) ||
  left.source_repo.localeCompare(right.source_repo) ||
  left.target_repo.localeCompare(right.target_repo) ||
  left.decision_status.localeCompare(right.decision_status) ||
  (left.adoption_status ?? '').localeCompare(right.adoption_status ?? '') ||
  (left.observed_outcome ?? '').localeCompare(right.observed_outcome ?? '') ||
  (left.decision_reason ?? '').localeCompare(right.decision_reason ?? '') ||
  (left.outcome_confidence ?? 0) - (right.outcome_confidence ?? 0);

const buildRecordKey = (record: PortabilityOutcomeTelemetryRecord): string =>
  [
    record.recommendation_id,
    record.pattern_id,
    record.source_repo,
    record.target_repo,
    record.decision_status,
    record.adoption_status ?? '',
    record.observed_outcome ?? '',
    record.timestamp
  ].join('::');

const isDecisionStatus = (value: unknown): value is PortabilityDecisionStatus =>
  value === 'proposed' || value === 'reviewed' || value === 'accepted' || value === 'rejected' || value === 'superseded';

const isAdoptionStatus = (value: unknown): value is PortabilityAdoptionStatus =>
  value === 'proposed' || value === 'reviewed' || value === 'accepted' || value === 'rejected' || value === 'adopted' || value === 'superseded';

const isObservedOutcome = (value: unknown): value is PortabilityObservedOutcome =>
  value === 'successful' || value === 'unsuccessful' || value === 'inconclusive';

const normalizeOutcomeRecord = (value: unknown): PortabilityOutcomeTelemetryRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;

  if (
    typeof input.recommendation_id !== 'string' ||
    typeof input.pattern_id !== 'string' ||
    typeof input.source_repo !== 'string' ||
    typeof input.target_repo !== 'string' ||
    !isDecisionStatus(input.decision_status) ||
    typeof input.timestamp !== 'string'
  ) {
    return null;
  }

  const outcomeConfidence = typeof input.outcome_confidence === 'number' ? Math.max(0, Math.min(1, round4(input.outcome_confidence))) : undefined;

  return {
    recommendation_id: input.recommendation_id,
    pattern_id: input.pattern_id,
    source_repo: input.source_repo,
    target_repo: input.target_repo,
    decision_status: input.decision_status,
    ...(typeof input.decision_reason === 'string' && input.decision_reason.length > 0 ? { decision_reason: input.decision_reason } : {}),
    ...(isAdoptionStatus(input.adoption_status) ? { adoption_status: input.adoption_status } : {}),
    ...(isObservedOutcome(input.observed_outcome) ? { observed_outcome: input.observed_outcome } : {}),
    ...(typeof outcomeConfidence === 'number' ? { outcome_confidence: outcomeConfidence } : {}),
    timestamp: input.timestamp
  };
};

const normalizeOutcomeRecords = (records: unknown[]): PortabilityOutcomeTelemetryRecord[] => {
  const seen = new Set<string>();
  const normalized: PortabilityOutcomeTelemetryRecord[] = [];

  for (const value of records) {
    const record = normalizeOutcomeRecord(value);
    if (!record) continue;
    const key = buildRecordKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(record);
  }

  return normalized.sort(compareOutcomes);
};

export const normalizePortabilityOutcomesArtifact = (artifact: Partial<PortabilityOutcomesArtifact> | undefined): PortabilityOutcomesArtifact => {
  const outcomesRaw = Array.isArray(artifact?.outcomes)
    ? artifact.outcomes
    : Array.isArray((artifact as { records?: unknown[] } | undefined)?.records)
      ? ((artifact as { records?: unknown[] }).records ?? [])
      : [];

  const outcomes = normalizeOutcomeRecords(outcomesRaw as unknown[]);
  const generatedAt = [typeof artifact?.generatedAt === 'string' ? artifact.generatedAt : undefined, ...outcomes.map((entry) => entry.timestamp)]
    .filter((value): value is string => typeof value === 'string')
    .sort((left, right) => right.localeCompare(left))[0] ?? new Date(0).toISOString();

  return {
    schemaVersion: PORTABILITY_OUTCOMES_SCHEMA_VERSION,
    kind: 'portability-outcomes',
    generatedAt,
    outcomes
  };
};

export const readPortabilityOutcomesArtifact = (repoRoot: string): PortabilityOutcomesArtifact => {
  const artifactPath = path.join(repoRoot, PORTABILITY_OUTCOMES_RELATIVE_PATH);
  const existing = readJsonIfExists<Partial<PortabilityOutcomesArtifact>>(artifactPath);
  return normalizePortabilityOutcomesArtifact(existing);
};

export const appendPortabilityOutcomes = (
  repoRoot: string,
  records: PortabilityOutcomeTelemetryRecord[]
): PortabilityOutcomesArtifact => {
  const artifactPath = path.join(repoRoot, PORTABILITY_OUTCOMES_RELATIVE_PATH);
  const existing = readPortabilityOutcomesArtifact(repoRoot);
  const merged = normalizeOutcomeRecords([...existing.outcomes, ...records]);
  const generatedAt = [existing.generatedAt, ...merged.map((entry) => entry.timestamp)]
    .sort((left, right) => right.localeCompare(left))[0] ?? new Date(0).toISOString();

  const artifact: PortabilityOutcomesArtifact = {
    schemaVersion: PORTABILITY_OUTCOMES_SCHEMA_VERSION,
    kind: 'portability-outcomes',
    generatedAt,
    outcomes: merged
  };

  writeDeterministicJsonAtomic(artifactPath, artifact);
  return artifact;
};

export const summarizePortabilityOutcomes = (
  artifact: PortabilityOutcomesArtifact,
  lookup: PortabilityOutcomeLookup = {}
): PortabilityOutcomeTelemetryRecord[] =>
  artifact.outcomes.filter((record) => {
    if (lookup.pattern_id && record.pattern_id !== lookup.pattern_id) return false;
    if (lookup.source_repo && record.source_repo !== lookup.source_repo) return false;
    if (lookup.target_repo && record.target_repo !== lookup.target_repo) return false;
    if (lookup.decision_status && record.decision_status !== lookup.decision_status) return false;
    return true;
  });
