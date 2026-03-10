import { createHash } from 'node:crypto';
import type { CandidatePatternPreview, CandidatePatternPreviewArtifact, GraphGroupArtifact, GraphSnapshot, GraphVertex } from '../schema/graphMemory.js';

export type BuildCandidatePatternsInput = {
  snapshot: GraphSnapshot;
  groupsArtifact: GraphGroupArtifact;
  createdAt?: string;
};

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
};

const mostFrequent = (values: string[]): string | undefined => {
  if (values.length === 0) {
    return undefined;
  }
  const counter = new Map<string, number>();
  for (const value of values) {
    counter.set(value, (counter.get(value) ?? 0) + 1);
  }
  return [...counter.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
};

const buildTitle = (canonicalKey: string, vertices: GraphVertex[]): string => {
  const subject = mostFrequent(vertices.map((vertex) => (typeof vertex.metadata.subject === 'string' ? vertex.metadata.subject : '')).filter(Boolean));
  if (subject) {
    return `Candidate Pattern: ${subject}`;
  }
  const fallback = canonicalKey.replace(/^zettel:/, '').replace(/[-_]+/g, ' ').trim();
  return `Candidate Pattern: ${fallback}`;
};

export const buildCandidatePatterns = ({ snapshot, groupsArtifact, createdAt }: BuildCandidatePatternsInput): CandidatePatternPreviewArtifact => {
  const verticesById = new Map(snapshot.vertices.map((vertex) => [vertex.id, vertex]));

  const candidates: CandidatePatternPreview[] = groupsArtifact.groups
    .filter((group) => group.compatibilityStatus === 'compatible' && group.memberZettelIds.length > 1)
    .map((group) => {
      const members = group.memberZettelIds
        .map((memberId) => verticesById.get(memberId))
        .filter((entry): entry is GraphVertex => Boolean(entry));

      const canonicalKey = group.sharedCanonicalKey ?? mostFrequent(members.map((member) => member.canonicalKey ?? '').filter(Boolean)) ?? group.groupId;
      const summary = mostFrequent(members.map((member) => (typeof member.metadata.summary === 'string' ? member.metadata.summary : '')).filter(Boolean)) ??
        `Deterministic contraction preview for ${group.memberZettelIds.length} linked zettels.`;
      const mechanism = mostFrequent(members.map((member) => (typeof member.metadata.mechanism === 'string' ? member.metadata.mechanism : '')).filter(Boolean));
      const invariant = mostFrequent(members.map((member) => (typeof member.metadata.invariant === 'string' ? member.metadata.invariant : '')).filter(Boolean));

      const contractRefs = new Set<string>(group.sharedContractRefs);
      const evidenceRefs = new Set<string>();
      for (const edge of snapshot.edges) {
        if (!group.memberVertexIds.includes(edge.from) && !group.memberVertexIds.includes(edge.to)) {
          continue;
        }
        for (const ref of edge.evidenceRefs) {
          evidenceRefs.add(ref);
        }
      }

      for (const member of members) {
        for (const contractRef of toStringArray(member.metadata.contractRefs)) {
          contractRefs.add(contractRef);
        }
        if (member.sourceArtifactPath) {
          evidenceRefs.add(`source:${member.sourceArtifactPath}`);
        }
      }

      const evidenceCount = evidenceRefs.size;
      const confidence = Math.min(0.99, 0.55 + Math.min(0.3, group.groupingReasons.length * 0.08) + Math.min(0.14, evidenceCount * 0.01));
      const compactionScore = Math.min(1, group.memberZettelIds.length / Math.max(1, evidenceCount));
      const promotionReadiness: CandidatePatternPreview['promotionReadiness'] = confidence >= 0.85 ? 'high' : confidence >= 0.7 ? 'medium' : 'low';

      return {
        candidateId: `candidate:${createHash('sha256').update(group.groupId).digest('hex').slice(0, 12)}`,
        originCycleId: snapshot.cycleId,
        sourceGroupId: group.groupId,
        memberZettelIds: [...group.memberZettelIds].sort((left, right) => left.localeCompare(right)),
        title: buildTitle(canonicalKey, members),
        canonicalKey,
        summary,
        mechanism,
        invariant,
        evidenceRefs: [...evidenceRefs].sort((left, right) => left.localeCompare(right)),
        contractRefs: [...contractRefs].sort((left, right) => left.localeCompare(right)),
        confidence,
        compactionScore,
        boundaryFlags: [...group.boundaryFlags],
        promotionReadiness
      };
    })
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey) || left.candidateId.localeCompare(right.candidateId));

  const created = createdAt ?? new Date().toISOString();
  const artifactId = `candidate-patterns:${snapshot.cycleId}:${createHash('sha256').update(snapshot.snapshotId).update('|').update(created).digest('hex').slice(0, 12)}`;

  return {
    schemaVersion: '1.0',
    kind: 'playbook-candidate-pattern-preview',
    artifactId,
    cycleId: snapshot.cycleId,
    snapshotId: snapshot.snapshotId,
    groupsArtifactId: groupsArtifact.artifactId,
    createdAt: created,
    candidates,
    metrics: {
      candidatePatternCount: candidates.length,
      contractionRatio: snapshot.metrics.zettelCount === 0 ? 0 : candidates.length / snapshot.metrics.zettelCount,
      avgConfidence: candidates.length === 0 ? 0 : candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / candidates.length
    }
  };
};
