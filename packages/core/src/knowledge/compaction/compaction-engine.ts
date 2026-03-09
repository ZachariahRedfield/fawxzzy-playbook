import { canonicalizeKnowledgeRecord } from './canonicalize.js';
import { compareCanonicalKnowledge } from './compare.js';
import type { CandidateCompactionInput, CompactionDecision } from './compaction-types.js';

export const decideKnowledgeCompaction = (input: CandidateCompactionInput): CompactionDecision => {
  const canonicalCandidate = canonicalizeKnowledgeRecord(input.candidate);
  const canonicalArtifacts = input.existingArtifacts.map((artifact) => canonicalizeKnowledgeRecord(artifact));
  const comparison = compareCanonicalKnowledge(canonicalCandidate, canonicalArtifacts);

  return {
    decisionType: comparison.decisionType,
    candidateId: input.candidate.id,
    canonicalKey: canonicalCandidate.canonicalKey,
    targetArtifactId: comparison.targetArtifactId
  };
};
