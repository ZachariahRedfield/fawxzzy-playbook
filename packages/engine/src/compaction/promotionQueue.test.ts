import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { PatternCompactionArtifact } from './compactPatterns.js';
import { buildPatternReviewQueue } from './promotionQueue.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-promotion-queue-'));

const writeConvergenceArtifact = (repo: string): void => {
  fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, '.playbook', 'pattern-convergence.json'),
    JSON.stringify(
      {
        schemaVersion: '1.0',
        kind: 'pattern-convergence',
        generatedAt: '2026-03-20T00:00:00.000Z',
        proposalOnly: true,
        sourceArtifacts: ['.playbook/pattern-candidates.json', '.playbook/patterns-promoted.json'],
        clusters: [
          {
            clusterId: 'cluster:deterministic-governance-mutation-boundary-read-only-artifact-synthesis',
            intent: 'deterministic-governance',
            constraint_class: 'mutation-boundary',
            resolution_strategy: 'read-only-artifact-synthesis',
            members: [
              {
                source: 'candidate',
                id: 'candidate-query-before-mutation',
                title: 'query before mutation',
                intent: 'deterministic-governance',
                constraint_class: 'mutation-boundary',
                resolution_strategy: 'read-only-artifact-synthesis'
              }
            ],
            shared_abstraction: 'shared abstraction',
            convergence_confidence: 0.95,
            recommended_higher_order_pattern: 'recommended pattern'
          }
        ]
      },
      null,
      2
    )
  );
};

const createPatternsArtifact = (): PatternCompactionArtifact => ({
  schemaVersion: '1.0',
  command: 'pattern-compaction',
  patterns: [
    {
      id: 'QUERY_BEFORE_MUTATION',
      bucket: 'governance',
      occurrences: 5,
      examples: ['verify query read-only contract', 'index query before apply mutation', 'read-only artifact synthesis before mutation']
    },
    {
      id: 'TEST_GOVERNANCE_SIGNAL',
      bucket: 'governance',
      occurrences: 5,
      examples: ['deterministic testing governance pattern', 'stable review queue ordering', 'explicit promotion gates']
    }
  ]
});

describe('buildPatternReviewQueue convergence weighting', () => {
  it('emits deterministic additive proposal-only weighting suggestions from convergence inputs', () => {
    const repo = createRepo();
    writeConvergenceArtifact(repo);
    const patterns = createPatternsArtifact();

    const first = buildPatternReviewQueue(patterns, '2026-03-21T00:00:00.000Z', { repoRoot: repo });
    const second = buildPatternReviewQueue(patterns, '2026-03-21T00:00:00.000Z', { repoRoot: repo });

    expect(second).toEqual(first);
    expect(first.candidates.length).toBeGreaterThan(0);

    const topCandidate = first.candidates[0];
    expect(topCandidate.convergencePrioritySuggestion.proposalOnly).toBe(true);
    expect(topCandidate.convergencePrioritySuggestion.matchedClusterId).toBe(
      'cluster:deterministic-governance-mutation-boundary-read-only-artifact-synthesis'
    );
    expect(topCandidate.convergencePrioritySuggestion.convergenceConfidence).toBe(0.95);
    expect(topCandidate.convergencePrioritySuggestion.suggestedPriority).toBe('high');
    expect(topCandidate.convergencePrioritySuggestion.weightedScore).toBeGreaterThanOrEqual(topCandidate.promotionScore);
    expect(topCandidate.convergencePrioritySuggestion.rationale).toContain('without changing promotion confidence or lifecycle state');
    expect(topCandidate.convergencePrioritySuggestion.provenance.convergenceArtifact).toBe('.playbook/pattern-convergence.json');
    expect(topCandidate.convergencePrioritySuggestion.provenance.matchStrategy).toBe('member-id-first-then-metadata-token-overlap');
    expect(topCandidate.confidence).toBeGreaterThan(0);
  });

  it('keeps weighting additive and never mutates lifecycle artifacts', () => {
    const repo = createRepo();
    writeConvergenceArtifact(repo);
    const patterns = createPatternsArtifact();
    const promotedPath = path.join(repo, '.playbook', 'patterns-promoted.json');

    fs.writeFileSync(
      promotedPath,
      JSON.stringify({ schemaVersion: '1.0', kind: 'playbook-promoted-patterns', promotedPatterns: [] }, null, 2)
    );
    const before = fs.readFileSync(promotedPath, 'utf8');

    const queue = buildPatternReviewQueue(patterns, '2026-03-21T00:00:00.000Z', { repoRoot: repo });

    const after = fs.readFileSync(promotedPath, 'utf8');
    expect(after).toBe(before);
    expect(queue.candidates.every((candidate) => candidate.convergencePrioritySuggestion.proposalOnly)).toBe(true);
    expect(queue.candidates.every((candidate) => candidate.stage === 'review')).toBe(true);
  });
});
