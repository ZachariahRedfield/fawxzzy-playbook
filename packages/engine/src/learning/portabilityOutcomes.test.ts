import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendPortabilityOutcomes,
  readPortabilityOutcomesArtifact,
  summarizePortabilityOutcomes
} from './portabilityOutcomes.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-portability-outcomes-'));

describe('portability outcomes artifact', () => {
  it('records accepted and successful transfer', () => {
    const repoRoot = createRepo();
    appendPortabilityOutcomes(repoRoot, [
      {
        recommendation_id: 'rec-1',
        pattern_id: 'router_over_fragmented_knowledge_lifecycle',
        source_repo: 'repo-a',
        target_repo: 'repo-b',
        decision_status: 'accepted',
        decision_reason: 'fit confirmed',
        adoption_status: 'adopted',
        observed_outcome: 'successful',
        outcome_confidence: 0.93,
        timestamp: '2026-06-01T00:00:00.000Z'
      }
    ]);

    const artifact = readPortabilityOutcomesArtifact(repoRoot);
    expect(artifact.outcomes).toHaveLength(1);
    expect(artifact.outcomes[0]?.observed_outcome).toBe('successful');
  });

  it('records rejected transfer and inconclusive transfer with missing optional fields', () => {
    const repoRoot = createRepo();
    appendPortabilityOutcomes(repoRoot, [
      {
        recommendation_id: 'rec-2',
        pattern_id: 'route_signal_telemetry_learning',
        source_repo: 'repo-c',
        target_repo: 'repo-d',
        decision_status: 'rejected',
        timestamp: '2026-06-01T01:00:00.000Z'
      },
      {
        recommendation_id: 'rec-3',
        pattern_id: 'route_signal_telemetry_learning',
        source_repo: 'repo-c',
        target_repo: 'repo-e',
        decision_status: 'reviewed',
        adoption_status: 'reviewed',
        observed_outcome: 'inconclusive',
        timestamp: '2026-06-01T02:00:00.000Z'
      }
    ]);

    const artifact = readPortabilityOutcomesArtifact(repoRoot);
    expect(artifact.outcomes).toHaveLength(2);
    expect(artifact.outcomes[0]?.decision_status).toBe('rejected');
    expect(artifact.outcomes[1]?.observed_outcome).toBe('inconclusive');
    expect(artifact.outcomes[0]?.decision_reason).toBeUndefined();
    expect(artifact.outcomes[0]?.outcome_confidence).toBeUndefined();
  });

  it('maintains deterministic ordering, dedupes, and supports summary filtering', () => {
    const repoRoot = createRepo();
    appendPortabilityOutcomes(repoRoot, [
      {
        recommendation_id: 'rec-b',
        pattern_id: 'telemetry_learning.capture',
        source_repo: 'repo-z',
        target_repo: 'repo-y',
        decision_status: 'proposed',
        timestamp: '2026-06-02T00:00:00.000Z'
      },
      {
        recommendation_id: 'rec-a',
        pattern_id: 'knowledge_lifecycle.capture',
        source_repo: 'repo-a',
        target_repo: 'repo-b',
        decision_status: 'accepted',
        adoption_status: 'adopted',
        observed_outcome: 'successful',
        timestamp: '2026-06-01T00:00:00.000Z'
      },
      {
        recommendation_id: 'rec-a',
        pattern_id: 'knowledge_lifecycle.capture',
        source_repo: 'repo-a',
        target_repo: 'repo-b',
        decision_status: 'accepted',
        adoption_status: 'adopted',
        observed_outcome: 'successful',
        timestamp: '2026-06-01T00:00:00.000Z'
      }
    ]);

    const artifact = readPortabilityOutcomesArtifact(repoRoot);
    expect(artifact.outcomes.map((entry) => entry.recommendation_id)).toEqual(['rec-a', 'rec-b']);

    const byDecision = summarizePortabilityOutcomes(artifact, { decision_status: 'accepted' });
    expect(byDecision).toHaveLength(1);
    expect(byDecision[0]?.pattern_id).toBe('knowledge_lifecycle.capture');
  });
});
