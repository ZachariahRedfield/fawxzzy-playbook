import { createHash } from 'node:crypto';
import type { CandidatePatternPreviewArtifact, GraphSnapshot, GraphVertex } from '../schema/graphMemory.js';
import type { PatternCardDraft, PatternCardDraftArtifact } from '../schema/patternCardDraft.js';

export type SynthesizePatternCardDraftsInput = {
  snapshot: GraphSnapshot;
  candidateArtifact: CandidatePatternPreviewArtifact;
  createdAt?: string;
};

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const toTitleCase = (value: string): string =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const stablePatternId = (canonicalKey: string): string => `pattern-draft:${createHash('sha256').update(canonicalKey).digest('hex').slice(0, 16)}`;

const cleanCanonicalSubject = (canonicalKey: string): string => canonicalKey.replace(/^[a-z]+:/, '').replace(/[-_]+/g, ' ').trim();

const toStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);

const isContradictionFlag = (flag: string): boolean =>
  flag === 'invariant_conflict' || flag === 'mechanism_conflict' || flag === 'cross_contract_conflict';

const mostFrequent = (values: string[]): string | undefined => {
  if (values.length === 0) {
    return undefined;
  }
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
};

const deriveDeterministicTitle = (canonicalKey: string, members: GraphVertex[]): string => {
  const subject = mostFrequent(
    members
      .map((member) => (typeof member.metadata.subject === 'string' ? normalize(member.metadata.subject) : ''))
      .filter(Boolean)
  );
  return `Pattern Draft: ${toTitleCase((subject ?? normalize(cleanCanonicalSubject(canonicalKey))) || canonicalKey)}`;
};

export const synthesizePatternCardDrafts = ({ snapshot, candidateArtifact, createdAt }: SynthesizePatternCardDraftsInput): PatternCardDraftArtifact => {
  const created = createdAt ?? new Date().toISOString();
  const verticesById = new Map(snapshot.vertices.map((vertex) => [vertex.id, vertex]));

  const existingPatternCanonical = new Set(
    snapshot.vertices.filter((vertex) => vertex.kind === 'PatternCard' && typeof vertex.canonicalKey === 'string').map((vertex) => vertex.canonicalKey as string)
  );
  const contractVertices = snapshot.vertices.filter((vertex) => vertex.kind === 'Contract');
  const existingContractCanonical = new Set(contractVertices.filter((vertex) => typeof vertex.canonicalKey === 'string').map((vertex) => vertex.canonicalKey as string));
  const existingContractRefs = new Set(contractVertices.map((vertex) => vertex.id));
  const existingNormalizedSubjects = new Set(
    snapshot.vertices
      .filter((vertex) => vertex.kind === 'PatternCard' || vertex.kind === 'Contract')
      .map((vertex) => (typeof vertex.metadata.subject === 'string' ? normalize(vertex.metadata.subject) : ''))
      .filter(Boolean)
  );

  const drafts: PatternCardDraft[] = candidateArtifact.candidates.map((candidate) => {
    const members = candidate.memberZettelIds.map((id) => verticesById.get(id)).filter((entry): entry is GraphVertex => Boolean(entry));
    const normalizedSubject = mostFrequent(
      members
        .map((member) => (typeof member.metadata.subject === 'string' ? normalize(member.metadata.subject) : ''))
        .filter(Boolean)
    ) ?? normalize(cleanCanonicalSubject(candidate.canonicalKey));

    const sourceArtifactPaths = new Set<string>();
    for (const member of members) {
      if (member.sourceArtifactPath) {
        sourceArtifactPaths.add(member.sourceArtifactPath);
      }
      for (const artifactRef of toStringArray(member.metadata.artifactRefs)) {
        sourceArtifactPaths.add(artifactRef);
      }
    }
    for (const evidenceRef of candidate.evidenceRefs) {
      if (evidenceRef.startsWith('source:')) {
        sourceArtifactPaths.add(evidenceRef.slice('source:'.length));
      }
    }

    const sourceCycleIds = [...new Set(members.map((member) => member.originCycleId))].sort((left, right) => left.localeCompare(right));
    const contradictionFlags = candidate.boundaryFlags.filter((flag) => isContradictionFlag(flag));

    const dedupeFlags: string[] = [];
    if (existingPatternCanonical.has(candidate.canonicalKey)) {
      dedupeFlags.push('duplicate_canonical_key:pattern');
    }
    if (existingContractCanonical.has(candidate.canonicalKey)) {
      dedupeFlags.push('duplicate_canonical_key:contract');
    }
    if (existingNormalizedSubjects.has(normalizedSubject)) {
      dedupeFlags.push('duplicate_normalized_subject');
    }

    const contractConflict = candidate.contractRefs.some((contractRef) => existingContractCanonical.has(contractRef) || existingContractRefs.has(contractRef));
    if (contractConflict) {
      dedupeFlags.push('contract_conflict');
    }

    const conflictFlags = [...new Set([...dedupeFlags, ...contradictionFlags.map((flag) => `contradiction:${flag}`)])].sort((left, right) => left.localeCompare(right));

    const draftStatus: PatternCardDraft['draftStatus'] = conflictFlags.length > 0 || candidate.boundaryFlags.length > 0
      ? 'draft'
      : candidate.confidence >= 0.85
        ? 'ready'
        : 'review';

    return {
      patternId: stablePatternId(candidate.canonicalKey),
      originCycleId: candidate.originCycleId,
      sourceGroupId: candidate.sourceGroupId,
      sourceZettelIds: [...candidate.memberZettelIds].sort((left, right) => left.localeCompare(right)),
      sourceArtifactPaths: [...sourceArtifactPaths].sort((left, right) => left.localeCompare(right)),
      canonicalKey: candidate.canonicalKey,
      title: deriveDeterministicTitle(candidate.canonicalKey, members),
      summary: candidate.summary,
      mechanism: candidate.mechanism,
      invariant: candidate.invariant,
      evidenceRefs: [...candidate.evidenceRefs].sort((left, right) => left.localeCompare(right)),
      linkedContractRefs: [...candidate.contractRefs].sort((left, right) => left.localeCompare(right)),
      recurrence: {
        cycleCount: sourceCycleIds.length,
        latestCycleId: sourceCycleIds[sourceCycleIds.length - 1] ?? candidate.originCycleId,
        sourceCycleIds
      },
      conflictFlags,
      boundaryFlags: [...candidate.boundaryFlags].sort((left, right) => left.localeCompare(right)),
      draftStatus
    };
  }).sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey) || left.patternId.localeCompare(right.patternId));

  return {
    schemaVersion: '1.0',
    kind: 'playbook-pattern-card-drafts',
    artifactId: `pattern-card-drafts:${candidateArtifact.cycleId}:${createHash('sha256').update(candidateArtifact.artifactId).update('|').update(created).digest('hex').slice(0, 12)}`,
    cycleId: candidateArtifact.cycleId,
    snapshotId: candidateArtifact.snapshotId,
    sourceCandidateArtifactId: candidateArtifact.artifactId,
    createdAt: created,
    drafts,
    metrics: {
      draftCount: drafts.length,
      conflictFlagCount: drafts.reduce((sum, draft) => sum + draft.conflictFlags.length, 0),
      boundaryFlagCount: drafts.reduce((sum, draft) => sum + draft.boundaryFlags.length, 0)
    }
  };
};
