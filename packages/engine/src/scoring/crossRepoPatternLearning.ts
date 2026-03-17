import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const clamp = (value: number): number => Math.max(0, Math.min(1, round2(value)));

export type CrossRepoInput = {
  id: string;
  repoPath: string;
};

type GovernedArtifactKind =
  | 'repo-index'
  | 'cycle-state'
  | 'cycle-history'
  | 'policy-evaluation'
  | 'policy-apply-result'
  | 'pr-review'
  | 'session'
  | 'system-map';

const GOVERNED_ARTIFACTS: { kind: GovernedArtifactKind; relPath: string }[] = [
  { kind: 'repo-index', relPath: '.playbook/repo-index.json' },
  { kind: 'cycle-state', relPath: '.playbook/cycle-state.json' },
  { kind: 'cycle-history', relPath: '.playbook/cycle-history.json' },
  { kind: 'policy-evaluation', relPath: '.playbook/policy-evaluation.json' },
  { kind: 'policy-apply-result', relPath: '.playbook/policy-apply-result.json' },
  { kind: 'pr-review', relPath: '.playbook/pr-review.json' },
  { kind: 'session', relPath: '.playbook/session.json' },
  { kind: 'system-map', relPath: '.playbook/system-map.json' }
];

export type CrossRepoPatternRepositorySummary = { id: string; repoPath: string; patternCount: number; patterns: unknown[] };
export type CrossRepoPatternAggregate = { pattern_id: string; portability_score: number; repo_count: number };

type EvidenceRef = {
  repo_id: string;
  artifact_kind: string;
  artifact_path: string;
  pointer: string;
  excerpt: string;
  value_digest: string | null;
};

type CandidatePattern = {
  id: string;
  title: string;
  classification: 'gap' | 'strength' | 'workflow-pattern' | 'artifact-pattern';
  status: 'candidate_read_only';
  basis: 'artifact-evidence';
  supporting_repos: string[];
  evidence: EvidenceRef[];
  portability: {
    score: number;
    factors: Array<{ name: string; value: number }>;
  };
  promotion: { mode: 'manual_only' };
};

export type CrossRepoPatternsArtifact = {
  kind: 'cross-repo-patterns';
  version: 1;
  generated_at: string;
  mode: 'read-only';
  source_repos: Array<{
    repo_id: string;
    repo_root: string;
    readiness: string;
    governed_artifacts: Array<{
      artifact_kind: string;
      path: string;
      present: boolean;
      digest: string | null;
      governed: true;
    }>;
  }>;
  comparisons: Array<{
    id: string;
    left_repo_id: string;
    right_repo_id: string;
    shared_gaps: Array<{ artifact_kind: string; evidence: EvidenceRef[] }>;
    shared_patterns: Array<{ artifact_kind: string; evidence: EvidenceRef[] }>;
    repo_deltas: Array<{ artifact_kind: string; left_present: boolean; right_present: boolean }>;
  }>;
  candidate_patterns: CandidatePattern[];
  schemaVersion?: '1.0';
  generatedAt?: string;
  repositories?: Array<{ id: string; repoPath: string; patternCount: number; patterns: unknown[] }>;
  aggregates?: Array<{ pattern_id: string; portability_score: number; repo_count: number }>;
};

const digestValue = (value: unknown): string => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

const readJsonIfExists = (targetPath: string): unknown | null => {
  if (!fs.existsSync(targetPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(targetPath, 'utf8')) as unknown;
  } catch {
    return null;
  }
};

const toReadiness = (presentCount: number, total: number): string => {
  if (presentCount === 0) return 'connected_only';
  if (presentCount === total) return 'observable';
  return 'partially_observable';
};

export const computeCrossRepoPatternLearning = (repositories: CrossRepoInput[]): CrossRepoPatternsArtifact => {
  const repoRecords = repositories.map((repo) => {
    const governed = GOVERNED_ARTIFACTS.map((spec) => {
      const artifactPath = path.join(repo.repoPath, spec.relPath);
      const value = readJsonIfExists(artifactPath);
      return {
        artifact_kind: spec.kind,
        path: spec.relPath,
        present: value !== null,
        digest: value === null ? null : digestValue(value),
        governed: true as const,
        value
      };
    });

    const presentCount = governed.filter((entry) => entry.present).length;
    return {
      repo_id: repo.id,
      repo_root: repo.repoPath,
      readiness: toReadiness(presentCount, governed.length),
      governed_artifacts: governed
    };
  });

  const comparisons = repoRecords.flatMap((left, leftIndex) =>
    repoRecords.slice(leftIndex + 1).map((right) => {
      const sharedGaps = GOVERNED_ARTIFACTS
        .map((spec) => {
          const leftArtifact = left.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)!;
          const rightArtifact = right.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)!;
          if (leftArtifact.present || rightArtifact.present) return null;
          return {
            artifact_kind: spec.kind,
            evidence: [left, right].map((repoRecord) => ({
              repo_id: repoRecord.repo_id,
              artifact_kind: spec.kind,
              artifact_path: spec.relPath,
              pointer: '/present',
              excerpt: 'missing-governed-artifact',
              value_digest: null
            }))
          };
        })
        .filter(Boolean) as Array<{ artifact_kind: string; evidence: EvidenceRef[] }>;

      const sharedPatterns = GOVERNED_ARTIFACTS
        .map((spec) => {
          const leftArtifact = left.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)!;
          const rightArtifact = right.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)!;
          if (!leftArtifact.present || !rightArtifact.present) return null;
          return {
            artifact_kind: spec.kind,
            evidence: [left, right].map((repoRecord) => {
              const artifact = repoRecord.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)!;
              return {
                repo_id: repoRecord.repo_id,
                artifact_kind: spec.kind,
                artifact_path: spec.relPath,
                pointer: '/kind',
                excerpt: 'governed-artifact-present',
                value_digest: artifact.digest
              };
            })
          };
        })
        .filter(Boolean) as Array<{ artifact_kind: string; evidence: EvidenceRef[] }>;

      return {
        id: `${left.repo_id}::${right.repo_id}`,
        left_repo_id: left.repo_id,
        right_repo_id: right.repo_id,
        shared_gaps: sharedGaps,
        shared_patterns: sharedPatterns,
        repo_deltas: GOVERNED_ARTIFACTS.map((spec) => {
          const leftArtifact = left.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)!;
          const rightArtifact = right.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)!;
          return { artifact_kind: spec.kind, left_present: leftArtifact.present, right_present: rightArtifact.present };
        }).filter((entry) => entry.left_present !== entry.right_present)
      };
    })
  );

  const candidatePatterns: CandidatePattern[] = [];
  for (const spec of GOVERNED_ARTIFACTS) {
    const supporting = repoRecords.filter((repo) => repo.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)?.present);
    if (supporting.length >= 2) {
      const digests = supporting
        .map((repo) => repo.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)?.digest)
        .filter((value): value is string => typeof value === 'string');
      const digestCounts = new Map<string, number>();
      for (const digest of digests) digestCounts.set(digest, (digestCounts.get(digest) ?? 0) + 1);
      const maxDigestSupport = Math.max(...[...digestCounts.values(), 0]);
      const artifactConsistency = digests.length === 0 ? 0 : maxDigestSupport / digests.length;
      const supportingCountFactor = supporting.length;
      const repoDiversity = new Set(supporting.map((repo) => repo.readiness)).size / supporting.length;
      const score = clamp((supporting.length / Math.max(repoRecords.length, 1)) * 0.4 + artifactConsistency * 0.35 + repoDiversity * 0.25);

      candidatePatterns.push({
        id: `pattern-${spec.kind}`,
        title: `Portable governed artifact pattern: ${spec.kind}`,
        classification: 'artifact-pattern',
        status: 'candidate_read_only',
        basis: 'artifact-evidence',
        supporting_repos: supporting.map((repo) => repo.repo_id),
        evidence: supporting.map((repo) => {
          const artifact = repo.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)!;
          return {
            repo_id: repo.repo_id,
            artifact_kind: spec.kind,
            artifact_path: spec.relPath,
            pointer: '/kind',
            excerpt: 'governed-artifact-present',
            value_digest: artifact.digest
          };
        }),
        portability: {
          score,
          factors: [
            { name: 'supporting_repo_count', value: supportingCountFactor },
            { name: 'artifact_consistency', value: clamp(artifactConsistency) },
            { name: 'rule_or_step_consistency', value: clamp(artifactConsistency) },
            { name: 'repo_diversity', value: clamp(repoDiversity) }
          ]
        },
        promotion: { mode: 'manual_only' }
      });
    }

    const missingSupport = repoRecords.filter((repo) => !repo.governed_artifacts.find((entry) => entry.artifact_kind === spec.kind)?.present);
    if (missingSupport.length >= 2) {
      candidatePatterns.push({
        id: `gap-${spec.kind}`,
        title: `Shared governed gap: missing ${spec.kind}`,
        classification: 'gap',
        status: 'candidate_read_only',
        basis: 'artifact-evidence',
        supporting_repos: missingSupport.map((repo) => repo.repo_id),
        evidence: missingSupport.map((repo) => ({
          repo_id: repo.repo_id,
          artifact_kind: spec.kind,
          artifact_path: spec.relPath,
          pointer: '/present',
          excerpt: 'missing-governed-artifact',
          value_digest: null
        })),
        portability: {
          score: 0,
          factors: [
            { name: 'supporting_repo_count', value: missingSupport.length },
            { name: 'artifact_consistency', value: 0 },
            { name: 'rule_or_step_consistency', value: 0 },
            { name: 'repo_diversity', value: 0 }
          ]
        },
        promotion: { mode: 'manual_only' }
      });
    }
  }

  candidatePatterns.sort((a, b) => b.portability.score - a.portability.score || a.id.localeCompare(b.id));

  return {
    kind: 'cross-repo-patterns',
    version: 1,
    generated_at: new Date().toISOString(),
    mode: 'read-only',
    source_repos: repoRecords.map((repo) => ({
      repo_id: repo.repo_id,
      repo_root: repo.repo_root,
      readiness: repo.readiness,
      governed_artifacts: repo.governed_artifacts.map((artifact) => ({
        artifact_kind: artifact.artifact_kind,
        path: artifact.path,
        present: artifact.present,
        digest: artifact.digest,
        governed: true as const
      }))
    })),
    comparisons,
    candidate_patterns: candidatePatterns,
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    repositories: repoRecords.map((repo) => ({ id: repo.repo_id, repoPath: repo.repo_root, patternCount: 0, patterns: [] })),
    aggregates: candidatePatterns.map((entry) => ({ pattern_id: entry.id, portability_score: entry.portability.score, repo_count: entry.supporting_repos.length }))
  };
};

export const writeCrossRepoPatternsArtifact = (cwd: string, artifact: CrossRepoPatternsArtifact): string => {
  const targetPath = path.join(cwd, '.playbook', 'cross-repo-patterns.json');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return targetPath;
};

export const readCrossRepoPatternsArtifact = (cwd: string): CrossRepoPatternsArtifact => {
  const targetPath = path.join(cwd, '.playbook', 'cross-repo-patterns.json');
  if (!fs.existsSync(targetPath)) {
    throw new Error('playbook patterns: missing artifact at .playbook/cross-repo-patterns.json. Run "playbook patterns cross-repo" first.');
  }
  return JSON.parse(fs.readFileSync(targetPath, 'utf8')) as CrossRepoPatternsArtifact;
};
