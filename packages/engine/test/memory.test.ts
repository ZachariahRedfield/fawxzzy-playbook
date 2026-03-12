import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { promoteKnowledgeCandidate, pruneMemory } from '../src/memory/index.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const writeCandidates = (repo: string, candidates: Array<{ candidateId: string; theme: string; evidence: Array<{ path: string }> }>): void => {
  const filePath = path.join(repo, '.playbook', 'knowledge', 'candidates.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        schemaVersion: '1.0',
        command: 'learn-draft',
        baseRef: 'main',
        baseSha: 'aaa',
        headSha: 'bbb',
        diffContext: true,
        changedFiles: [],
        candidates: candidates.map((entry) => ({ ...entry, dedupe: { kind: 'none' } }))
      },
      null,
      2
    )
  );
};

describe('memory promotion and pruning', () => {
  it('links supersession when promoting duplicate fingerprints', () => {
    const repo = createRepo('playbook-engine-memory-supersedes');

    writeCandidates(repo, [
      { candidateId: 'c1', theme: 'cli-pattern', evidence: [{ path: 'packages/cli/src/commands/a.ts' }] },
      { candidateId: 'c2', theme: 'cli-pattern', evidence: [{ path: 'packages/cli/src/commands/a.ts' }] }
    ]);

    const first = promoteKnowledgeCandidate(repo, 'c1');
    const second = promoteKnowledgeCandidate(repo, 'c2');

    expect(first.knowledgeKind).toBe('patterns');
    expect(second.promoted.supersedes).toEqual(['km-c1']);

    const artifact = JSON.parse(fs.readFileSync(path.join(repo, '.playbook/memory/knowledge/patterns.json'), 'utf8')) as {
      items: Array<{ id: string; supersededBy: string[] }>;
    };

    const original = artifact.items.find((entry) => entry.id === 'km-c1');
    expect(original?.supersededBy).toEqual(['km-c2']);
  });

  it('prunes superseded and duplicate items and stale candidates', () => {
    const repo = createRepo('playbook-engine-memory-prune');

    writeCandidates(repo, [
      { candidateId: 'stale', theme: 'decision-record', evidence: [{ path: 'docs/adr/1.md' }] }
    ]);
    const candidatePath = path.join(repo, '.playbook/knowledge/candidates.json');
    const staleTime = new Date('2020-01-01T00:00:00.000Z');
    fs.utimesSync(candidatePath, staleTime, staleTime);

    const knowledgePath = path.join(repo, '.playbook/memory/knowledge/patterns.json');
    fs.mkdirSync(path.dirname(knowledgePath), { recursive: true });
    fs.writeFileSync(
      knowledgePath,
      JSON.stringify(
        {
          schemaVersion: '1.0',
          kind: 'playbook-promoted-knowledge',
          knowledgeKind: 'patterns',
          updatedAt: new Date().toISOString(),
          items: [
            {
              id: 'km-1',
              fingerprint: 'f1',
              theme: 'theme',
              supersedes: [],
              supersededBy: ['km-3'],
              provenance: {
                promotedFromCandidateId: 'x',
                promotedAt: '2025-01-01T00:00:00.000Z',
                sourceArtifactPath: '.playbook/knowledge/candidates.json',
                evidence: [{ path: 'a' }]
              }
            },
            {
              id: 'km-2',
              fingerprint: 'f2',
              theme: 'theme',
              supersedes: [],
              supersededBy: [],
              provenance: {
                promotedFromCandidateId: 'y',
                promotedAt: '2025-01-01T00:00:00.000Z',
                sourceArtifactPath: '.playbook/knowledge/candidates.json',
                evidence: [{ path: 'b' }]
              }
            },
            {
              id: 'km-3',
              fingerprint: 'f2',
              theme: 'theme',
              supersedes: [],
              supersededBy: [],
              provenance: {
                promotedFromCandidateId: 'z',
                promotedAt: '2025-01-01T00:00:00.000Z',
                sourceArtifactPath: '.playbook/knowledge/candidates.json',
                evidence: [{ path: 'c' }]
              }
            }
          ]
        },
        null,
        2
      )
    );

    const result = pruneMemory(repo, { staleDays: 1 });
    expect(result.staleCandidatesPruned).toBe(1);
    expect(result.supersededPruned).toBeGreaterThanOrEqual(1);
    expect(result.duplicatesCollapsed).toBe(1);

    const pruned = JSON.parse(fs.readFileSync(knowledgePath, 'utf8')) as { items: Array<{ id: string }> };
    expect(pruned.items.map((entry) => entry.id)).toEqual(['km-2']);
  });
});
