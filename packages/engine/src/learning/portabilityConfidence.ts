import path from 'node:path';
import type { PortabilityConfidenceRecalibrationSummary } from '@zachariahredfield/playbook-core';
import { readJsonIfExists, writeDeterministicJsonAtomic } from './io.js';
import { LEARNING_COMPACTION_RELATIVE_PATH, type LearningCompactionArtifact } from './learningCompaction.js';
import { PATTERN_PORTABILITY_RELATIVE_PATH, type PatternPortabilityArtifact } from './patternPortability.js';

export const PORTABILITY_CONFIDENCE_SCHEMA_VERSION = '1.0' as const;
export const PORTABILITY_CONFIDENCE_RELATIVE_PATH = '.playbook/portability-confidence.json' as const;

const CROSS_REPO_PATTERNS_RELATIVE_PATH = '.playbook/cross-repo-patterns.json' as const;
const PORTABILITY_OUTCOMES_RELATIVE_PATH = '.playbook/portability-outcomes.json' as const;

type CrossRepoPatternsArtifact = {
  generatedAt?: string;
  aggregates?: Array<{ pattern_id?: string; portability_score?: number }>;
};

type PortabilityOutcomeRecord = {
  source_pattern_family?: string;
  pattern_family?: string;
  pattern_id?: string;
  source_repo?: string;
  target_repo?: string;
  outcome?: 'success' | 'failure' | 'partial' | 'blocked';
  success?: boolean;
};

type PortabilityOutcomesArtifact = {
  generatedAt?: string;
  outcomes?: PortabilityOutcomeRecord[];
  records?: PortabilityOutcomeRecord[];
};

export type PortabilityConfidenceArtifact = {
  schemaVersion: typeof PORTABILITY_CONFIDENCE_SCHEMA_VERSION;
  kind: 'portability-confidence';
  generatedAt: string;
  sourceArtifacts: {
    patternPortabilityPath: string;
    crossRepoPatternsPath: string;
    portabilityOutcomesPath: string;
    learningCompactionPath: string;
  };
  summaries: PortabilityConfidenceRecalibrationSummary[];
};

const round4 = (value: number): number => Number(value.toFixed(4));
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const derivePatternFamily = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  for (const subsystem of ['knowledge_lifecycle', 'telemetry_learning', 'improvement_engine']) {
    if (normalized.includes(subsystem)) return subsystem;
  }

  if (normalized.includes('.')) {
    const [head] = normalized.split('.');
    return head || 'unknown-family';
  }

  const tokens = normalized.split('_').filter(Boolean);
  if (tokens.length >= 2) {
    return `${tokens[tokens.length - 2]}_${tokens[tokens.length - 1]}`;
  }

  return normalized || 'unknown-family';
};

const parseOutcomeSuccess = (record: PortabilityOutcomeRecord): boolean | undefined => {
  if (typeof record.success === 'boolean') {
    return record.success;
  }

  if (!record.outcome) {
    return undefined;
  }

  if (record.outcome === 'success') return true;
  if (record.outcome === 'failure' || record.outcome === 'blocked') return false;
  return undefined;
};

const getOpenQuestions = (input: {
  sampleSize: number;
  outcomesAvailable: boolean;
  learningCompaction: LearningCompactionArtifact | undefined;
  delta: number;
}): string[] => {
  const questions = new Set<string>();
  if (!input.outcomesAvailable) {
    questions.add('Portability outcomes missing: confidence remains recommendation-only and should not gate automatic mutations.');
  }
  if (input.sampleSize < 3) {
    questions.add('Sparse transfer evidence: collect at least three portability outcomes before trusting recalibration direction.');
  }
  if (Math.abs(input.delta) >= 0.2) {
    questions.add('Large confidence delta detected: review transfer assumptions before promoting confidence adjustment into policy.');
  }

  for (const question of input.learningCompaction?.summary.open_questions ?? []) {
    questions.add(question);
  }

  return [...questions].sort((left, right) => left.localeCompare(right));
};

const computeRecalibratedConfidence = (priorConfidence: number, realizedSuccessRate: number, sampleSize: number): number => {
  if (sampleSize === 0) {
    return round4(clamp01(priorConfidence * 0.85 + 0.5 * 0.15));
  }

  const shrinkage = clamp01(sampleSize / (sampleSize + 3));
  const recalibrated = priorConfidence + (realizedSuccessRate - priorConfidence) * shrinkage;
  return round4(clamp01(recalibrated));
};

export const generatePortabilityConfidenceArtifact = (repoRoot: string): PortabilityConfidenceArtifact => {
  const patternPortability = readJsonIfExists<PatternPortabilityArtifact>(path.join(repoRoot, PATTERN_PORTABILITY_RELATIVE_PATH));
  if (!patternPortability || patternPortability.kind !== 'pattern-portability') {
    throw new Error('playbook portability confidence: missing .playbook/pattern-portability.json artifact.');
  }

  const crossRepoPatterns = readJsonIfExists<CrossRepoPatternsArtifact>(path.join(repoRoot, CROSS_REPO_PATTERNS_RELATIVE_PATH));
  const portabilityOutcomes = readJsonIfExists<PortabilityOutcomesArtifact>(path.join(repoRoot, PORTABILITY_OUTCOMES_RELATIVE_PATH));
  const learningCompaction = readJsonIfExists<LearningCompactionArtifact>(path.join(repoRoot, LEARNING_COMPACTION_RELATIVE_PATH));

  const crossRepoPortability = new Map<string, number>();
  for (const aggregate of crossRepoPatterns?.aggregates ?? []) {
    if (typeof aggregate.pattern_id !== 'string' || typeof aggregate.portability_score !== 'number') continue;
    crossRepoPortability.set(aggregate.pattern_id, clamp01(aggregate.portability_score));
  }

  const outcomes = portabilityOutcomes?.outcomes ?? portabilityOutcomes?.records ?? [];

  const outcomeByGroup = new Map<string, { total: number; success: number }>();
  for (const record of outcomes) {
    const family = record.source_pattern_family ?? record.pattern_family ?? (record.pattern_id ? derivePatternFamily(record.pattern_id) : 'unknown-family');
    const sourceRepo = record.source_repo ?? 'unknown-source';
    const targetRepo = record.target_repo ?? 'unknown-target';
    const success = parseOutcomeSuccess(record);
    if (typeof success !== 'boolean') continue;
    const key = `${family}::${sourceRepo}::${targetRepo}`;
    const existing = outcomeByGroup.get(key) ?? { total: 0, success: 0 };
    existing.total += 1;
    existing.success += success ? 1 : 0;
    outcomeByGroup.set(key, existing);
  }

  const priorByGroup = new Map<string, { confidences: number[] }>();
  for (const run of patternPortability.runs ?? []) {
    for (const score of run.scores ?? []) {
      const family = derivePatternFamily(score.pattern_id);
      const key = `${family}::${score.source_repo}::${score.target_repo}`;
      const existing = priorByGroup.get(key) ?? { confidences: [] };
      const base = clamp01(score.confidence_score);
      const withCrossRepo = crossRepoPortability.has(score.pattern_id)
        ? clamp01(base * 0.85 + (crossRepoPortability.get(score.pattern_id) ?? 0) * 0.15)
        : base;
      existing.confidences.push(withCrossRepo);
      priorByGroup.set(key, existing);
    }
  }

  const keys = new Set<string>([...priorByGroup.keys(), ...outcomeByGroup.keys()]);
  const summaries: PortabilityConfidenceRecalibrationSummary[] = [...keys]
    .map((key) => {
      const [sourcePatternFamily, sourceRepo, targetRepo] = key.split('::');
      const priorValues = priorByGroup.get(key)?.confidences ?? [];
      const priorAverage = round4(priorValues.length === 0 ? 0.5 : priorValues.reduce((sum, value) => sum + value, 0) / priorValues.length);
      const outcomesAggregate = outcomeByGroup.get(key);
      const sampleSize = outcomesAggregate?.total ?? 0;
      const realizedSuccessRate = round4(sampleSize === 0 ? 0.5 : outcomesAggregate!.success / sampleSize);
      const recalibratedConfidence = computeRecalibratedConfidence(priorAverage, realizedSuccessRate, sampleSize);
      const recommendedAdjustment = round4(recalibratedConfidence - priorAverage);

      return {
        source_pattern_family: sourcePatternFamily ?? 'unknown-family',
        source_repo: sourceRepo ?? 'unknown-source',
        target_repo: targetRepo ?? 'unknown-target',
        prior_confidence_average: priorAverage,
        realized_success_rate: realizedSuccessRate,
        recalibrated_confidence: recalibratedConfidence,
        recommended_adjustment: recommendedAdjustment,
        sample_size: sampleSize,
        open_questions: getOpenQuestions({
          sampleSize,
          outcomesAvailable: outcomes.length > 0,
          learningCompaction,
          delta: recommendedAdjustment
        })
      };
    })
    .sort(
      (left, right) =>
        left.source_pattern_family.localeCompare(right.source_pattern_family) ||
        left.source_repo.localeCompare(right.source_repo) ||
        left.target_repo.localeCompare(right.target_repo)
    );

  const generatedAtCandidates = [
    patternPortability.generatedAt,
    crossRepoPatterns?.generatedAt,
    portabilityOutcomes?.generatedAt,
    learningCompaction?.generatedAt,
    '1970-01-01T00:00:00.000Z'
  ].filter((value): value is string => typeof value === 'string');

  return {
    schemaVersion: PORTABILITY_CONFIDENCE_SCHEMA_VERSION,
    kind: 'portability-confidence',
    generatedAt: generatedAtCandidates.sort((left, right) => right.localeCompare(left))[0] ?? '1970-01-01T00:00:00.000Z',
    sourceArtifacts: {
      patternPortabilityPath: PATTERN_PORTABILITY_RELATIVE_PATH,
      crossRepoPatternsPath: CROSS_REPO_PATTERNS_RELATIVE_PATH,
      portabilityOutcomesPath: PORTABILITY_OUTCOMES_RELATIVE_PATH,
      learningCompactionPath: LEARNING_COMPACTION_RELATIVE_PATH
    },
    summaries
  };
};

export const writePortabilityConfidenceArtifact = (repoRoot: string, artifact: PortabilityConfidenceArtifact): string => {
  const targetPath = path.join(repoRoot, PORTABILITY_CONFIDENCE_RELATIVE_PATH);
  writeDeterministicJsonAtomic(targetPath, artifact);
  return targetPath;
};
