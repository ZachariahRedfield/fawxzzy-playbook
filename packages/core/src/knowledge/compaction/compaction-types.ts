import type { KnowledgeCandidate, KnowledgeCompacted } from '../knowledge-types.js';

export const compactionDecisionTypes = ['DISCARD', 'ATTACH_EVIDENCE', 'MERGE_VARIANT', 'NEW_PATTERN'] as const;

export type CompactionDecisionType = (typeof compactionDecisionTypes)[number];

export type CanonicalKnowledgeRecord = {
  artifactId: string;
  canonicalKey: string;
  canonicalRepresentation: string;
};

export type CompactionDecision = {
  decisionType: CompactionDecisionType;
  candidateId: string;
  canonicalKey: string;
  targetArtifactId?: string;
};

export type CandidateCompactionInput = {
  candidate: KnowledgeCandidate;
  existingArtifacts: KnowledgeCompacted[];
};
