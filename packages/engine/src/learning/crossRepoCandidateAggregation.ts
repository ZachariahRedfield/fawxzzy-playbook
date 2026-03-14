import fs from 'node:fs';
import path from 'node:path';

export const PATTERN_CANDIDATES_RELATIVE_PATH = '.playbook/pattern-candidates.json' as const;
export const CROSS_REPO_CANDIDATES_RELATIVE_PATH = '.playbook/cross-repo-candidates.json' as const;

export type CrossRepoCandidateInput = {
  id: string;
  repoPath: string;
};

type PatternCandidateRecord = {
  id: string;
  pattern_family: string;
  confidence: number;
};

type PatternCandidatesArtifact = {
  schemaVersion: '1.0';
  kind: 'pattern-candidates';
  generatedAt: string;
  candidates: PatternCandidateRecord[];
};

type NormalizedCandidateRecord = {
  repo_id: string;
  pattern_family: string;
  confidence: number;
  observed_at: string;
};

export type CrossRepoCandidateAggregate = {
  pattern_family: string;
  repo_count: number;
  candidate_count: number;
  mean_confidence: number;
  first_seen: string;
  last_seen: string;
};

export type CrossRepoCandidateAggregationArtifact = {
  schemaVersion: '1.0';
  kind: 'cross-repo-candidates';
  generatedAt: string;
  aggregates: CrossRepoCandidateAggregate[];
};

const readJson = <T>(targetPath: string): T => JSON.parse(fs.readFileSync(targetPath, 'utf8')) as T;

const normalizePatternFamily = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

const clampConfidence = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
};

const round4 = (value: number): number => Math.round((value + Number.EPSILON) * 10000) / 10000;

const readPatternCandidatesArtifact = (repoPath: string): PatternCandidatesArtifact => {
  const targetPath = path.join(repoPath, PATTERN_CANDIDATES_RELATIVE_PATH);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`playbook cross-repo candidates: missing artifact at ${targetPath}`);
  }

  const artifact = readJson<PatternCandidatesArtifact>(targetPath);
  if (artifact.kind !== 'pattern-candidates') {
    throw new Error(`playbook cross-repo candidates: invalid artifact kind in ${targetPath}`);
  }

  return artifact;
};

const normalizeCandidates = (repositories: CrossRepoCandidateInput[]): NormalizedCandidateRecord[] => {
  const records: NormalizedCandidateRecord[] = [];

  for (const repository of repositories) {
    const artifact = readPatternCandidatesArtifact(repository.repoPath);

    for (const candidate of artifact.candidates) {
      records.push({
        repo_id: repository.id,
        pattern_family: normalizePatternFamily(candidate.pattern_family),
        confidence: clampConfidence(candidate.confidence),
        observed_at: artifact.generatedAt
      });
    }
  }

  return records;
};

export const aggregateCrossRepoCandidates = (
  repositories: CrossRepoCandidateInput[],
  generatedAt = new Date().toISOString()
): CrossRepoCandidateAggregationArtifact => {
  const normalized = normalizeCandidates(repositories);
  const families = new Map<string, NormalizedCandidateRecord[]>();

  for (const record of normalized) {
    const existing = families.get(record.pattern_family) ?? [];
    existing.push(record);
    families.set(record.pattern_family, existing);
  }

  const aggregates: CrossRepoCandidateAggregate[] = [...families.entries()]
    .map(([patternFamily, records]) => {
      const repoCount = new Set(records.map((record) => record.repo_id)).size;
      const candidateCount = records.length;
      const meanConfidence = round4(records.reduce((sum, record) => sum + record.confidence, 0) / candidateCount);
      const observedTimestamps = records.map((record) => record.observed_at).sort((left, right) => left.localeCompare(right));

      return {
        pattern_family: patternFamily,
        repo_count: repoCount,
        candidate_count: candidateCount,
        mean_confidence: meanConfidence,
        first_seen: observedTimestamps[0],
        last_seen: observedTimestamps[observedTimestamps.length - 1]
      };
    })
    .sort((left, right) => left.pattern_family.localeCompare(right.pattern_family));

  return {
    schemaVersion: '1.0',
    kind: 'cross-repo-candidates',
    generatedAt,
    aggregates
  };
};

export const writeCrossRepoCandidateAggregationArtifact = (
  cwd: string,
  artifact: CrossRepoCandidateAggregationArtifact
): string => {
  const targetPath = path.join(cwd, CROSS_REPO_CANDIDATES_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return targetPath;
};

export const readCrossRepoCandidateAggregationArtifact = (cwd: string): CrossRepoCandidateAggregationArtifact => {
  const targetPath = path.join(cwd, CROSS_REPO_CANDIDATES_RELATIVE_PATH);
  if (!fs.existsSync(targetPath)) {
    throw new Error('playbook cross-repo candidates: missing artifact at .playbook/cross-repo-candidates.json');
  }

  return readJson<CrossRepoCandidateAggregationArtifact>(targetPath);
};
