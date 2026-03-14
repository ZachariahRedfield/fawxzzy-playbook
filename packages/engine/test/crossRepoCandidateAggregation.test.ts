import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateCrossRepoCandidates,
  readCrossRepoCandidateAggregationArtifact,
  writeCrossRepoCandidateAggregationArtifact,
  type CrossRepoCandidateAggregationArtifact
} from '../src/learning/crossRepoCandidateAggregation.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const writePatternCandidates = (
  repoPath: string,
  generatedAt: string,
  candidates: Array<{ pattern_family: string; confidence: number; id: string }>
): void => {
  const targetPath = path.join(repoPath, '.playbook', 'pattern-candidates.json');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(
    targetPath,
    `${JSON.stringify({ schemaVersion: '1.0', kind: 'pattern-candidates', generatedAt, candidates }, null, 2)}\n`,
    'utf8'
  );
};

describe('crossRepoCandidateAggregation', () => {
  it('aggregates deterministically and normalizes pattern families', () => {
    const repoA = createRepo('playbook-cross-repo-candidates-a');
    const repoB = createRepo('playbook-cross-repo-candidates-b');

    writePatternCandidates(repoA, '2025-01-01T00:00:00.000Z', [
      { id: 'a-1', pattern_family: 'Workflow Recursion', confidence: 0.6 },
      { id: 'a-2', pattern_family: 'workflow_recursion', confidence: 0.9 }
    ]);

    writePatternCandidates(repoB, '2025-02-01T00:00:00.000Z', [
      { id: 'b-1', pattern_family: 'workflow recursion', confidence: 0.3 },
      { id: 'b-2', pattern_family: 'layering', confidence: 0.5 }
    ]);

    const artifact = aggregateCrossRepoCandidates(
      [
        { id: 'repo-a', repoPath: repoA },
        { id: 'repo-b', repoPath: repoB }
      ],
      '2025-03-01T00:00:00.000Z'
    );

    expect(artifact).toEqual<CrossRepoCandidateAggregationArtifact>({
      schemaVersion: '1.0',
      kind: 'cross-repo-candidates',
      generatedAt: '2025-03-01T00:00:00.000Z',
      aggregates: [
        {
          pattern_family: 'layering',
          repo_count: 1,
          candidate_count: 1,
          mean_confidence: 0.5,
          first_seen: '2025-02-01T00:00:00.000Z',
          last_seen: '2025-02-01T00:00:00.000Z'
        },
        {
          pattern_family: 'workflow-recursion',
          repo_count: 2,
          candidate_count: 3,
          mean_confidence: 0.6,
          first_seen: '2025-01-01T00:00:00.000Z',
          last_seen: '2025-02-01T00:00:00.000Z'
        }
      ]
    });
  });

  it('writes stable artifact output for the same input', () => {
    const repoA = createRepo('playbook-cross-repo-candidates-write-a');
    const repoB = createRepo('playbook-cross-repo-candidates-write-b');
    const outputRoot = createRepo('playbook-cross-repo-candidates-output');

    writePatternCandidates(repoA, '2025-01-01T00:00:00.000Z', [{ id: 'a-1', pattern_family: 'Layering', confidence: 0.8 }]);
    writePatternCandidates(repoB, '2025-01-02T00:00:00.000Z', [{ id: 'b-1', pattern_family: 'layering', confidence: 0.4 }]);

    const firstArtifact = aggregateCrossRepoCandidates(
      [
        { id: 'repo-a', repoPath: repoA },
        { id: 'repo-b', repoPath: repoB }
      ],
      '2025-04-01T00:00:00.000Z'
    );
    const secondArtifact = aggregateCrossRepoCandidates(
      [
        { id: 'repo-a', repoPath: repoA },
        { id: 'repo-b', repoPath: repoB }
      ],
      '2025-04-01T00:00:00.000Z'
    );

    const outputPath = writeCrossRepoCandidateAggregationArtifact(outputRoot, firstArtifact);
    const firstWrite = fs.readFileSync(outputPath, 'utf8');
    writeCrossRepoCandidateAggregationArtifact(outputRoot, secondArtifact);
    const secondWrite = fs.readFileSync(outputPath, 'utf8');

    expect(firstArtifact).toEqual(secondArtifact);
    expect(firstWrite).toBe(secondWrite);
    expect(readCrossRepoCandidateAggregationArtifact(outputRoot)).toEqual(firstArtifact);
  });
});
