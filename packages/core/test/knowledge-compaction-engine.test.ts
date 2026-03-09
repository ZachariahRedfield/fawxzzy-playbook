import { describe, expect, it } from 'vitest';
import { decideKnowledgeCompaction } from '../src/knowledge/compaction/compaction-engine.js';
import {
  attachEvidenceCandidateFixture,
  discardCandidateFixture,
  existingCompactedArtifactsFixture,
  mergeVariantCandidateFixture,
  newPatternCandidateFixture
} from './knowledge-compaction-fixtures.js';

describe('knowledge compaction engine', () => {
  it('classifies obvious duplicates as DISCARD', () => {
    const decision = decideKnowledgeCompaction({
      candidate: discardCandidateFixture,
      existingArtifacts: existingCompactedArtifactsFixture
    });

    expect(decision.decisionType).toBe('DISCARD');
    expect(decision.targetArtifactId).toBe(existingCompactedArtifactsFixture[0]?.id);
    expect(decision.canonicalKey).toBe('pattern:local-cli-bootstrap');
  });

  it('attaches evidence when canonical key matches but representation differs', () => {
    const decision = decideKnowledgeCompaction({
      candidate: attachEvidenceCandidateFixture,
      existingArtifacts: existingCompactedArtifactsFixture
    });

    expect(decision.decisionType).toBe('ATTACH_EVIDENCE');
    expect(decision.targetArtifactId).toBe(existingCompactedArtifactsFixture[0]?.id);
  });

  it('merges wording variants when canonical representations match', () => {
    const decision = decideKnowledgeCompaction({
      candidate: mergeVariantCandidateFixture,
      existingArtifacts: existingCompactedArtifactsFixture
    });

    expect(decision.decisionType).toBe('MERGE_VARIANT');
    expect(decision.targetArtifactId).toBe(existingCompactedArtifactsFixture[0]?.id);
  });

  it('creates new patterns when no deterministic match is found', () => {
    const decision = decideKnowledgeCompaction({
      candidate: newPatternCandidateFixture,
      existingArtifacts: existingCompactedArtifactsFixture
    });

    expect(decision.decisionType).toBe('NEW_PATTERN');
    expect(decision.targetArtifactId).toBeUndefined();
  });

  it('produces identical decisions for identical inputs across runs', () => {
    const first = decideKnowledgeCompaction({
      candidate: mergeVariantCandidateFixture,
      existingArtifacts: existingCompactedArtifactsFixture
    });

    const second = decideKnowledgeCompaction({
      candidate: mergeVariantCandidateFixture,
      existingArtifacts: existingCompactedArtifactsFixture
    });

    expect(first).toEqual(second);
  });
});
