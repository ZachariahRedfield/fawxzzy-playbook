import { describe, expect, it } from 'vitest';
import { linkPatternCandidatesToGraph, type PatternCandidate, type PatternKnowledgeGraphArtifact } from '../src/index.js';

const graphFixture: PatternKnowledgeGraphArtifact = {
  schemaVersion: '1.0',
  kind: 'playbook-pattern-knowledge-graph',
  createdAt: '2026-01-01T00:00:00.000Z',
  patterns: [
    {
      patternId: 'pattern.layering-governance',
      title: 'Layered governance query flow',
      summary: 'Query-first governance and layered command execution.',
      layer: 'governance',
      mechanism: 'query-plane layering',
      evidenceRefs: ['docs/commands/query.md', '.playbook/docs-audit.json']
    },
    {
      patternId: 'pattern.runtime-outcomes',
      title: 'Runtime outcome scorecard',
      summary: 'Outcome reporting for runtime and repository lifecycle events.',
      layer: 'outcome',
      mechanism: 'outcome-signals',
      evidenceRefs: ['.playbook/runs/latest.json']
    }
  ],
  relations: [
    {
      relationId: 'rel-1',
      fromPatternId: 'pattern.layering-governance',
      toPatternId: 'pattern.runtime-outcomes',
      relationType: 'enables',
      evidenceRefs: ['docs/architecture/GRAPH_MEMORY.md']
    }
  ],
  instances: []
};

const candidate = (overrides: Partial<PatternCandidate>): PatternCandidate => ({
  id: 'candidate.default',
  detector: 'query-before-mutation',
  title: 'Default candidate',
  summary: 'Default summary for deterministic tests.',
  confidence: 0.9,
  evidence: [
    {
      artifact: 'docs/commands/query.md',
      pointer: '/commands/query',
      summary: 'query command contract reference'
    }
  ],
  related: ['pattern.layering-governance'],
  ...overrides
});

describe('candidate linking', () => {
  it('links strong matches and emits proposal-only append operations', () => {
    const report = linkPatternCandidatesToGraph(
      [
        candidate({
          id: 'candidate.strong',
          detector: 'query-before-mutation',
          title: 'Layered query-first governance flow',
          summary: 'governance query layering remains deterministic'
        })
      ],
      graphFixture
    );

    expect(report.summary).toEqual({ total: 1, linked: 1, observed: 0 });
    expect(report.generatedAt).toBe('deterministic');
    const [entry] = report.entries;
    expect(entry.state).toBe('linked');
    expect(entry.matchedPatternId).toBe('pattern.layering-governance');
    expect(entry.proposals.some((proposal) => proposal.operation === 'append_instance')).toBe(true);
    expect(entry.proposals.some((proposal) => proposal.operation === 'append_evidence')).toBe(true);
  });

  it('keeps low-confidence partial matches in observed state', () => {
    const report = linkPatternCandidatesToGraph(
      [
        candidate({
          id: 'candidate.partial',
          confidence: 0.42,
          title: 'Layered query-first governance flow',
          summary: 'governance query layering remains deterministic'
        })
      ],
      graphFixture
    );

    expect(report.summary).toEqual({ total: 1, linked: 0, observed: 1 });
    const [entry] = report.entries;
    expect(entry.state).toBe('observed');
    expect(entry.matchedPatternId).toBeNull();
    expect(entry.proposals).toEqual([]);
    expect(entry.score?.total).toBeGreaterThan(0);
  });

  it('keeps unmatched candidates observed with deterministic ordering', () => {
    const reportA = linkPatternCandidatesToGraph(
      [
        candidate({
          id: 'candidate.zzz',
          detector: 'workflow-recursion',
          confidence: 0.3,
          title: 'Unrelated recursion behavior',
          summary: 'recursive operation with no matching governance/evidence refs',
          evidence: [{ artifact: 'notes/random.txt', pointer: '/x', summary: 'unrelated evidence' }],
          related: ['external.ref']
        }),
        candidate({
          id: 'candidate.aaa',
          detector: 'workflow-recursion',
          confidence: 0.25,
          title: 'Another unrelated candidate',
          summary: 'still unrelated',
          evidence: [{ artifact: 'notes/other.txt', pointer: '/y', summary: 'other evidence' }],
          related: []
        })
      ],
      graphFixture
    );

    const reportB = linkPatternCandidatesToGraph(
      [
        candidate({
          id: 'candidate.aaa',
          detector: 'workflow-recursion',
          confidence: 0.25,
          title: 'Another unrelated candidate',
          summary: 'still unrelated',
          evidence: [{ artifact: 'notes/other.txt', pointer: '/y', summary: 'other evidence' }],
          related: []
        }),
        candidate({
          id: 'candidate.zzz',
          detector: 'workflow-recursion',
          confidence: 0.3,
          title: 'Unrelated recursion behavior',
          summary: 'recursive operation with no matching governance/evidence refs',
          evidence: [{ artifact: 'notes/random.txt', pointer: '/x', summary: 'unrelated evidence' }],
          related: ['external.ref']
        })
      ],
      graphFixture
    );

    expect(reportA.entries.map((entry) => entry.candidateId)).toEqual(['candidate.aaa', 'candidate.zzz']);
    expect(reportA).toEqual(reportB);
    expect(reportA.entries.every((entry) => entry.state === 'observed')).toBe(true);
  });
});
