import fs from 'node:fs';
import path from 'node:path';

const clampScore = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(4))));

export type PatternPortabilityEntry = {
  pattern_id: string;
  source_repo: string;
  evidence_runs: number;
  portability_score: number;
  confidence_score: number;
  supporting_artifacts: string[];
  related_subsystems: string[];
};

export type PatternPortabilityContract = {
  schemaVersion: '1.0';
  kind: 'pattern-portability';
  generatedAt: string;
  patterns: PatternPortabilityEntry[];
};

export type CrossRepoPatternEvidenceArtifact = {
  schemaVersion: '1.0';
  kind: 'cross-repo-patterns';
  generatedAt: string;
  patterns: {
    pattern_id: string;
    source_repo: string;
    portability_score: number;
    evidence_summary: {
      evidence_runs: number;
      confidence_score: number;
      supporting_artifacts: string[];
      related_subsystems: string[];
    };
  }[];
};

export type PortabilityArtifactInput = {
  sourceRepo: string;
  generatedAt?: string;
  patterns: {
    patternId: string;
    portabilityScore: number;
    confidenceScore?: number;
    evidenceRuns?: number;
    supportingArtifacts?: string[];
    relatedSubsystems?: string[];
  }[];
};

const normalizeList = (values: string[] | undefined, fallback: string): string[] => {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  return normalized.length > 0 ? normalized : [fallback];
};

export const createPatternPortabilityContract = (input: PortabilityArtifactInput): PatternPortabilityContract => {
  const patterns = [...input.patterns]
    .map((pattern): PatternPortabilityEntry => ({
      pattern_id: pattern.patternId,
      source_repo: input.sourceRepo,
      evidence_runs: Math.max(1, Math.floor(pattern.evidenceRuns ?? 1)),
      portability_score: clampScore(pattern.portabilityScore),
      confidence_score: clampScore(pattern.confidenceScore ?? pattern.portabilityScore),
      supporting_artifacts: normalizeList(pattern.supportingArtifacts, '.playbook/cross-repo-patterns.json'),
      related_subsystems: normalizeList(pattern.relatedSubsystems, 'bootstrap_contract_surface')
    }))
    .sort(
      (left, right) =>
        right.portability_score - left.portability_score ||
        right.confidence_score - left.confidence_score ||
        left.pattern_id.localeCompare(right.pattern_id)
    );

  return {
    schemaVersion: '1.0',
    kind: 'pattern-portability',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    patterns
  };
};

const isScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const isNonEmptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0);

export const validatePatternPortabilityContract = (contract: unknown): contract is PatternPortabilityContract => {
  if (!contract || typeof contract !== 'object') return false;

  const typed = contract as PatternPortabilityContract;
  if (typed.schemaVersion !== '1.0' || typed.kind !== 'pattern-portability' || typeof typed.generatedAt !== 'string' || !Array.isArray(typed.patterns)) {
    return false;
  }

  return typed.patterns.every(
    (entry) =>
      typeof entry.pattern_id === 'string' &&
      entry.pattern_id.trim().length > 0 &&
      typeof entry.source_repo === 'string' &&
      entry.source_repo.trim().length > 0 &&
      Number.isInteger(entry.evidence_runs) &&
      entry.evidence_runs >= 1 &&
      isScore(entry.portability_score) &&
      isScore(entry.confidence_score) &&
      isNonEmptyStringArray(entry.supporting_artifacts) &&
      isNonEmptyStringArray(entry.related_subsystems)
  );
};

export const toCrossRepoPatternEvidenceArtifact = (contract: PatternPortabilityContract): CrossRepoPatternEvidenceArtifact => ({
  schemaVersion: '1.0',
  kind: 'cross-repo-patterns',
  generatedAt: contract.generatedAt,
  patterns: contract.patterns.map((entry) => ({
    pattern_id: entry.pattern_id,
    source_repo: entry.source_repo,
    portability_score: entry.portability_score,
    evidence_summary: {
      evidence_runs: entry.evidence_runs,
      confidence_score: entry.confidence_score,
      supporting_artifacts: [...entry.supporting_artifacts],
      related_subsystems: [...entry.related_subsystems]
    }
  }))
});

export const writeCrossRepoPatternEvidenceArtifact = (cwd: string, contract: PatternPortabilityContract): string => {
  const artifact = toCrossRepoPatternEvidenceArtifact(contract);
  const targetPath = path.join(cwd, '.playbook', 'cross-repo-patterns.json');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return targetPath;
};
