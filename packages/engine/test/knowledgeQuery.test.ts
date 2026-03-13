import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  knowledgeInspect,
  knowledgeList,
  knowledgeProvenance,
  knowledgeQuery,
  knowledgeStale,
  knowledgeTimeline
} from '../src/query/knowledge.js';

const writeJson = (filePath: string, payload: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const setupRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-knowledge-query-'));

  writeJson(path.join(root, 'package.json'), { name: 'query-fixture' });
  writeJson(path.join(root, '.playbook/memory/events/event-1.json'), {
    schemaVersion: '1.0',
    kind: 'verify_run',
    eventInstanceId: 'event-1',
    eventFingerprint: 'fp-1',
    createdAt: '2026-02-01T00:00:00.000Z',
    repoRevision: 'r1',
    sources: [],
    subjectModules: ['module-a'],
    ruleIds: ['RULE-1'],
    riskSummary: { level: 'low', signals: [] },
    outcome: { status: 'success', summary: 'ok' },
    salienceInputs: {}
  });
  writeJson(path.join(root, '.playbook/memory/candidates.json'), {
    schemaVersion: '1.0',
    command: 'memory-replay',
    generatedAt: '2026-02-03T00:00:00.000Z',
    candidates: [
      {
        candidateId: 'cand-1',
        kind: 'pattern',
        title: 'Candidate',
        summary: 'Candidate summary',
        clusterKey: 'cluster-1',
        salienceScore: 7,
        salienceFactors: { severity: 1 },
        fingerprint: 'fp-1',
        module: 'module-a',
        ruleId: 'RULE-1',
        failureShape: 'shape-a',
        eventCount: 1,
        provenance: [
          { eventId: 'event-1', sourcePath: '.playbook/memory/events/event-1.json', fingerprint: 'fp-1', runId: 'run-1' }
        ],
        lastSeenAt: '2026-02-03T00:00:00.000Z',
        supersession: { evolutionOrdinal: 1, priorCandidateIds: [], supersedesCandidateIds: [] }
      }
    ]
  });
  writeJson(path.join(root, '.playbook/memory/knowledge/patterns.json'), {
    schemaVersion: '1.0',
    artifact: 'memory-knowledge',
    kind: 'pattern',
    generatedAt: '2026-02-04T00:00:00.000Z',
    entries: [
      {
        knowledgeId: 'pattern-1',
        candidateId: 'cand-1',
        sourceCandidateIds: ['cand-1'],
        sourceEventFingerprints: ['fp-1'],
        kind: 'pattern',
        title: 'Promoted pattern',
        summary: 'Promoted summary',
        fingerprint: 'fp-1',
        module: 'module-a',
        ruleId: 'RULE-1',
        failureShape: 'shape-a',
        promotedAt: '2026-02-04T00:00:00.000Z',
        provenance: [
          { eventId: 'event-1', sourcePath: '.playbook/memory/events/event-1.json', fingerprint: 'fp-1', runId: 'run-1' }
        ],
        status: 'active',
        supersedes: [],
        supersededBy: []
      }
    ]
  });

  return root;
};

describe('knowledge query services', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns stable payloads for list, query, timeline, and stale views', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T00:00:00.000Z'));
    const root = setupRepo();

    expect(knowledgeList(root).command).toBe('knowledge-list');
    expect(knowledgeQuery(root, { type: 'candidate' }).knowledge.map((record) => record.id)).toEqual(['cand-1']);
    expect(knowledgeTimeline(root, { order: 'asc' }).knowledge[0]?.id).toBe('event-1');
    expect(knowledgeStale(root).knowledge).toEqual([]);
  });

  it('inspects records and resolves provenance', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T00:00:00.000Z'));
    const root = setupRepo();

    expect(knowledgeInspect(root, 'pattern-1').knowledge.type).toBe('promoted');
    const provenance = knowledgeProvenance(root, 'pattern-1');
    expect(provenance.provenance.record.id).toBe('pattern-1');
    expect(provenance.provenance.evidence.map((record) => record.id)).toEqual(['event-1']);
    expect(provenance.provenance.relatedRecords.map((record) => record.id)).toEqual(['cand-1']);
  });
});
