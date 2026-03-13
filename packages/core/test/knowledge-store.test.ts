import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildKnowledgeSummary,
  getKnowledgeById,
  getKnowledgeProvenance,
  getKnowledgeTimeline,
  getStaleKnowledge,
  listKnowledge,
  queryKnowledge
} from '../src/knowledge/store.js';

const writeJson = (filePath: string, payload: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const setupRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-knowledge-store-'));

  writeJson(path.join(root, 'package.json'), { name: 'fixture-repo' });
  writeJson(path.join(root, '.playbook/memory/events/event-1.json'), {
    schemaVersion: '1.0',
    kind: 'verify_run',
    eventInstanceId: 'event-1',
    eventFingerprint: 'fp-1',
    createdAt: '2026-02-01T00:00:00.000Z',
    repoRevision: 'r1',
    sources: [{ type: 'verify', reference: 'verify-1' }],
    subjectModules: ['module-a'],
    ruleIds: ['RULE-1'],
    riskSummary: { level: 'low', signals: [] },
    outcome: { status: 'success', summary: 'ok' },
    salienceInputs: {}
  });
  writeJson(path.join(root, '.playbook/memory/events/event-2.json'), {
    schemaVersion: '1.0',
    kind: 'plan_run',
    eventInstanceId: 'event-2',
    eventFingerprint: 'fp-2',
    createdAt: '2026-02-02T00:00:00.000Z',
    repoRevision: 'r2',
    sources: [{ type: 'plan', reference: 'plan-1' }],
    subjectModules: ['module-b'],
    ruleIds: ['RULE-2'],
    riskSummary: { level: 'medium', signals: [] },
    outcome: { status: 'success', summary: 'ok' },
    salienceInputs: {}
  });
  writeJson(path.join(root, '.playbook/memory/candidates.json'), {
    schemaVersion: '1.0',
    command: 'memory-replay',
    generatedAt: '2026-02-03T00:00:00.000Z',
    candidates: [
      {
        candidateId: 'cand-live',
        kind: 'pattern',
        title: 'Live candidate',
        summary: 'Needs review',
        clusterKey: 'cluster-live',
        salienceScore: 8,
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
      },
      {
        candidateId: 'cand-stale',
        kind: 'decision',
        title: 'Stale candidate',
        summary: 'Old evidence',
        clusterKey: 'cluster-stale',
        salienceScore: 3,
        salienceFactors: { severity: 1 },
        fingerprint: 'fp-2',
        module: 'module-b',
        ruleId: 'RULE-2',
        failureShape: 'shape-b',
        eventCount: 1,
        provenance: [
          { eventId: 'event-2', sourcePath: '.playbook/memory/events/event-2.json', fingerprint: 'fp-2', runId: 'run-2' }
        ],
        lastSeenAt: '2025-01-01T00:00:00.000Z',
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
        knowledgeId: 'pattern-live',
        candidateId: 'cand-live',
        sourceCandidateIds: ['cand-live'],
        sourceEventFingerprints: ['fp-1'],
        kind: 'pattern',
        title: 'Promoted pattern',
        summary: 'Reusable guidance',
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
      },
      {
        knowledgeId: 'pattern-old',
        candidateId: 'cand-stale',
        sourceCandidateIds: ['cand-stale'],
        sourceEventFingerprints: ['fp-2'],
        kind: 'pattern',
        title: 'Superseded pattern',
        summary: 'Old guidance',
        fingerprint: 'fp-2',
        module: 'module-b',
        ruleId: 'RULE-2',
        failureShape: 'shape-b',
        promotedAt: '2025-01-01T00:00:00.000Z',
        provenance: [
          { eventId: 'event-2', sourcePath: '.playbook/memory/events/event-2.json', fingerprint: 'fp-2', runId: 'run-2' }
        ],
        status: 'superseded',
        supersedes: [],
        supersededBy: ['pattern-live']
      }
    ]
  });

  return root;
};

describe('knowledge store inspection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists knowledge across evidence, candidates, and promoted artifacts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T00:00:00.000Z'));
    const root = setupRepo();

    const records = listKnowledge(root);

    expect(records.map((record) => record.id)).toEqual([
      'pattern-live',
      'cand-live',
      'event-2',
      'event-1',
      'pattern-old',
      'cand-stale'
    ]);

    expect(buildKnowledgeSummary(records)).toEqual({
      total: 6,
      byType: { evidence: 2, candidate: 2, promoted: 1, superseded: 1 },
      byStatus: { observed: 2, active: 2, stale: 1, retired: 0, superseded: 1 }
    });
  });

  it('filters by type, status, module, and text query', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T00:00:00.000Z'));
    const root = setupRepo();

    expect(queryKnowledge(root, { type: 'candidate' }).map((record) => record.id)).toEqual(['cand-live', 'cand-stale']);
    expect(queryKnowledge(root, { status: 'superseded' }).map((record) => record.id)).toEqual(['pattern-old']);
    expect(queryKnowledge(root, { module: 'module-a' }).map((record) => record.id)).toContain('pattern-live');
    expect(queryKnowledge(root, { text: 'Old guidance' }).map((record) => record.id)).toEqual(['pattern-old']);
  });

  it('builds timelines, direct lookups, provenance, and stale views', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T00:00:00.000Z'));
    const root = setupRepo();

    expect(getKnowledgeById(root, 'pattern-live')?.type).toBe('promoted');
    expect(getKnowledgeTimeline(root, { order: 'asc', limit: 2 }).map((record) => record.id)).toEqual(['cand-stale', 'pattern-old']);
    expect(getStaleKnowledge(root).map((record) => record.id)).toEqual(['pattern-old', 'cand-stale']);

    const provenance = getKnowledgeProvenance(root, 'pattern-live');
    expect(provenance?.record.id).toBe('pattern-live');
    expect(provenance?.evidence.map((record) => record.id)).toEqual(['event-1']);
    expect(provenance?.relatedRecords.map((record) => record.id)).toEqual(['cand-live']);
  });
});
