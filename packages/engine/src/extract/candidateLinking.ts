import { createHash } from 'node:crypto';
import type { PatternKnowledgeGraphArtifact, PatternKnowledgePattern, PatternKnowledgeRelation } from '../schema/patternKnowledgeGraph.js';
import type { PatternCandidate } from './detectors/types.js';

export type CandidateLinkProposalOperation =
  | {
      operation: 'append_instance';
      candidateId: string;
      patternId: string;
      instanceId: string;
      sourceArtifactPath: string;
      evidenceRefs: string[];
      rationale: string;
    }
  | {
      operation: 'append_evidence';
      candidateId: string;
      patternId: string;
      evidenceRef: string;
      rationale: string;
    };

export type CandidateLinkScore = {
  family: number;
  mechanism: number;
  relation: number;
  evidence: number;
  total: number;
};

export type CandidateLinkMatch = {
  patternId: string;
  score: CandidateLinkScore;
};

export type CandidateLinkReportEntry = {
  candidateId: string;
  state: 'linked' | 'observed';
  confidence: number;
  matchedPatternId: string | null;
  score: CandidateLinkScore | null;
  proposals: CandidateLinkProposalOperation[];
  rationale: string;
};

export type CandidateLinkReport = {
  schemaVersion: '1.0';
  kind: 'playbook-pattern-candidate-link-report';
  generatedAt: 'deterministic';
  summary: {
    total: number;
    linked: number;
    observed: number;
  };
  entries: CandidateLinkReportEntry[];
};

const stableId = (prefix: string, value: string): string =>
  `${prefix}.${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const DETECTOR_LAYER_FAMILY: Record<string, string[]> = {
  layering: ['mechanism', 'governance'],
  modularity: ['mechanism', 'governance'],
  'workflow-recursion': ['mechanism'],
  'query-before-mutation': ['governance', 'mechanism'],
  'contract-symmetry': ['governance', 'mechanism']
};

const compareScore = (left: CandidateLinkMatch, right: CandidateLinkMatch): number => {
  return (
    right.score.total - left.score.total ||
    right.score.evidence - left.score.evidence ||
    right.score.mechanism - left.score.mechanism ||
    left.patternId.localeCompare(right.patternId)
  );
};

const candidateEvidenceRefs = (candidate: PatternCandidate): string[] => {
  const refs = candidate.evidence.flatMap((evidence) => [evidence.artifact, evidence.pointer]);
  return uniqueSorted(refs.filter((value) => value.length > 0));
};

const mechanismOverlapScore = (candidate: PatternCandidate, pattern: PatternKnowledgePattern): number => {
  const left = new Set(tokenize(`${candidate.title} ${candidate.summary} ${candidate.related.join(' ')}`));
  const right = new Set(tokenize(`${pattern.title} ${pattern.summary} ${pattern.mechanism}`));
  if (left.size === 0 || right.size === 0) return 0;

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }

  return overlap / Math.max(1, Math.min(left.size, right.size));
};

const familyScore = (candidate: PatternCandidate, pattern: PatternKnowledgePattern): number => {
  const expectedFamilies = DETECTOR_LAYER_FAMILY[candidate.detector] ?? [];
  if (expectedFamilies.includes(pattern.layer)) return 1;
  return pattern.layer === 'signal' || pattern.layer === 'outcome' ? 0.25 : 0;
};

const relationCompatibilityScore = (
  candidate: PatternCandidate,
  pattern: PatternKnowledgePattern,
  relationsByPatternId: Map<string, PatternKnowledgeRelation[]>
): number => {
  const relations = relationsByPatternId.get(pattern.patternId) ?? [];
  if (relations.length === 0) return 0.4;

  const relatedSet = new Set(candidate.related);
  const directlyReferenced = relations.some((relation) => relatedSet.has(relation.fromPatternId) || relatedSet.has(relation.toPatternId));
  if (directlyReferenced) return 1;

  return 0.5;
};

const evidenceCompatibilityScore = (candidate: PatternCandidate, pattern: PatternKnowledgePattern): number => {
  const patternEvidence = new Set(pattern.evidenceRefs);
  const candidateRefs = candidateEvidenceRefs(candidate);
  if (candidateRefs.length === 0) return 0;

  let compatible = 0;
  for (const ref of candidateRefs) {
    if ([...patternEvidence].some((patternRef) => patternRef === ref || patternRef.includes(ref) || ref.includes(patternRef))) {
      compatible += 1;
    }
  }

  return compatible / candidateRefs.length;
};

const toScore = (
  candidate: PatternCandidate,
  pattern: PatternKnowledgePattern,
  relationsByPatternId: Map<string, PatternKnowledgeRelation[]>
): CandidateLinkScore => {
  const family = familyScore(candidate, pattern);
  const mechanism = mechanismOverlapScore(candidate, pattern);
  const relation = relationCompatibilityScore(candidate, pattern, relationsByPatternId);
  const evidence = evidenceCompatibilityScore(candidate, pattern);
  const weighted = family * 0.3 + mechanism * 0.35 + relation * 0.15 + evidence * 0.2;

  return {
    family: Number(family.toFixed(4)),
    mechanism: Number(mechanism.toFixed(4)),
    relation: Number(relation.toFixed(4)),
    evidence: Number(evidence.toFixed(4)),
    total: Number((weighted * candidate.confidence).toFixed(4))
  };
};

const shouldLink = (candidate: PatternCandidate, score: CandidateLinkScore): boolean => candidate.confidence >= 0.6 && score.total >= 0.55;

const buildProposals = (candidate: PatternCandidate, pattern: PatternKnowledgePattern): CandidateLinkProposalOperation[] => {
  const candidateRefs = candidateEvidenceRefs(candidate);
  const patternEvidence = new Set(pattern.evidenceRefs);
  const appendEvidence = candidateRefs
    .filter((ref) => !patternEvidence.has(ref))
    .sort((left, right) => left.localeCompare(right))
    .map((evidenceRef) => ({
      operation: 'append_evidence' as const,
      candidateId: candidate.id,
      patternId: pattern.patternId,
      evidenceRef,
      rationale: 'Candidate evidence is compatible with matched pattern and should be reviewable as additive enrichment.'
    }));

  const sourceArtifactPath = candidate.evidence.map((entry) => entry.artifact).filter((entry) => entry.length > 0).sort((a, b) => a.localeCompare(b))[0] ?? '.playbook/pattern-candidates.json';

  const appendInstance: CandidateLinkProposalOperation = {
    operation: 'append_instance',
    candidateId: candidate.id,
    patternId: pattern.patternId,
    instanceId: stableId('instance.proposed', `${candidate.id}:${pattern.patternId}`),
    sourceArtifactPath,
    evidenceRefs: uniqueSorted(candidateRefs),
    rationale: 'Candidate link is strong enough to propose an additional instance without mutating canonical graph state.'
  };

  return [appendInstance, ...appendEvidence];
};

export const linkPatternCandidatesToGraph = (
  candidates: PatternCandidate[],
  graph: PatternKnowledgeGraphArtifact
): CandidateLinkReport => {
  const relationsByPatternId = new Map<string, PatternKnowledgeRelation[]>();

  for (const relation of graph.relations) {
    const from = relationsByPatternId.get(relation.fromPatternId) ?? [];
    from.push(relation);
    relationsByPatternId.set(relation.fromPatternId, from);

    const to = relationsByPatternId.get(relation.toPatternId) ?? [];
    to.push(relation);
    relationsByPatternId.set(relation.toPatternId, to);
  }

  const entries = [...candidates]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((candidate): CandidateLinkReportEntry => {
      const matches = graph.patterns
        .map((pattern) => ({ patternId: pattern.patternId, score: toScore(candidate, pattern, relationsByPatternId) }))
        .sort(compareScore);

      const best = matches[0] ?? null;
      if (!best) {
        return {
          candidateId: candidate.id,
          state: 'observed',
          confidence: Number(candidate.confidence.toFixed(2)),
          matchedPatternId: null,
          score: null,
          proposals: [],
          rationale: 'No deterministic pattern candidates were available for linking.'
        };
      }

      if (!shouldLink(candidate, best.score)) {
        return {
          candidateId: candidate.id,
          state: 'observed',
          confidence: Number(candidate.confidence.toFixed(2)),
          matchedPatternId: null,
          score: best.score,
          proposals: [],
          rationale: 'Best match did not meet deterministic confidence/compatibility threshold; keeping candidate observed.'
        };
      }

      const pattern = graph.patterns.find((entry) => entry.patternId === best.patternId)!;
      return {
        candidateId: candidate.id,
        state: 'linked',
        confidence: Number(candidate.confidence.toFixed(2)),
        matchedPatternId: best.patternId,
        score: best.score,
        proposals: buildProposals(candidate, pattern),
        rationale: 'Candidate matched by family/mechanism/relation/evidence compatibility; emitting proposal-only graph enrichment operations.'
      };
    });

  const linked = entries.filter((entry) => entry.state === 'linked').length;
  return {
    schemaVersion: '1.0',
    kind: 'playbook-pattern-candidate-link-report',
    generatedAt: 'deterministic',
    summary: {
      total: entries.length,
      linked,
      observed: entries.length - linked
    },
    entries
  };
};
