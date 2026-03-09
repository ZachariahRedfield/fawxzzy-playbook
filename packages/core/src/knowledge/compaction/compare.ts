import type { CanonicalKnowledgeRecord, CompactionDecisionType } from './compaction-types.js';

const sortCanonicalRecords = (records: CanonicalKnowledgeRecord[]): CanonicalKnowledgeRecord[] =>
  [...records].sort(
    (a, b) =>
      a.canonicalKey.localeCompare(b.canonicalKey) ||
      a.canonicalRepresentation.localeCompare(b.canonicalRepresentation) ||
      a.artifactId.localeCompare(b.artifactId)
  );

const findByExactMatch = (candidate: CanonicalKnowledgeRecord, existing: CanonicalKnowledgeRecord[]): CanonicalKnowledgeRecord | undefined =>
  sortCanonicalRecords(existing).find(
    (artifact) => artifact.canonicalKey === candidate.canonicalKey && artifact.canonicalRepresentation === candidate.canonicalRepresentation
  );

const findByCanonicalKey = (candidate: CanonicalKnowledgeRecord, existing: CanonicalKnowledgeRecord[]): CanonicalKnowledgeRecord | undefined =>
  sortCanonicalRecords(existing).find((artifact) => artifact.canonicalKey === candidate.canonicalKey);

const findByCanonicalRepresentation = (
  candidate: CanonicalKnowledgeRecord,
  existing: CanonicalKnowledgeRecord[]
): CanonicalKnowledgeRecord | undefined =>
  sortCanonicalRecords(existing).find((artifact) => artifact.canonicalRepresentation === candidate.canonicalRepresentation);

export const compareCanonicalKnowledge = (
  candidate: CanonicalKnowledgeRecord,
  existing: CanonicalKnowledgeRecord[]
): { decisionType: CompactionDecisionType; targetArtifactId?: string } => {
  const exactMatch = findByExactMatch(candidate, existing);
  if (exactMatch) {
    return {
      decisionType: 'DISCARD',
      targetArtifactId: exactMatch.artifactId
    };
  }

  const keyMatch = findByCanonicalKey(candidate, existing);
  if (keyMatch) {
    return {
      decisionType: 'ATTACH_EVIDENCE',
      targetArtifactId: keyMatch.artifactId
    };
  }

  const representationMatch = findByCanonicalRepresentation(candidate, existing);
  if (representationMatch) {
    return {
      decisionType: 'MERGE_VARIANT',
      targetArtifactId: representationMatch.artifactId
    };
  }

  return {
    decisionType: 'NEW_PATTERN'
  };
};
