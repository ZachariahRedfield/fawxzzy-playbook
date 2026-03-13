import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  expandMemoryProvenance,
  lookupMemoryCandidateKnowledge,
  lookupMemoryEventTimeline,
  lookupPromotedMemoryKnowledge
} from '../src/memory/inspection.js';

const writeJson = (filePath: string, payload: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const setupRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-memory-inspection-'));

  writeJson(path.join(root, '.playbook/memory/events/event-2.json'), {
    schemaVersion: '1.0',
    kind: 'plan_run',
    eventInstanceId: 'event-2',
    eventFingerprint: 'fp-2',
    createdAt: '2026-01-02T00:00:00.000Z',
    repoRevision: 'r2',
    sources: [],
    subjectModules: ['module-a'],
    ruleIds: ['RULE-1'],
    riskSummary: { level: 'medium', signals: [] },
    outcome: { status: 'success', summary: 'ok' },
    salienceInputs: {}
  });

  writeJson(path.join(root, '.playbook/memory/events/event-1.json'), {
    schemaVersion: '1.0',
    kind: 'verify_run',
    eventInstanceId: 'event-1',
    eventFingerprint: 'fp-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    repoRevision: 'r1',
    sources: [],
    subjectModules: ['module-a'],
    ruleIds: ['RULE-1'],
    riskSummary: { level: 'low', signals: [] },
    outcome: { status: 'success', summary: 'ok' },
    salienceInputs: {}
  });

  writeJson(path.join(root, '.playbook/memory/index.json'), {
    schemaVersion: '1.0',
    generatedAt: '2026-01-02T00:00:00.000Z',
    byModule: {
      'module-a': ['events/event-2.json', 'events/event-1.json']
    },
    byRule: {
      'RULE-1': ['events/event-2.json', 'events/event-1.json']
    },
    byFingerprint: {
      'fp-1': ['events/event-1.json'],
      'fp-2': ['events/event-2.json']
    }
  });

  writeJson(path.join(root, '.playbook/memory/candidates.json'), {
    schemaVersion: '1.0',
    command: 'memory-replay',
    sourceIndex: '.playbook/memory/index.json',
    generatedAt: '2026-01-03T00:00:00.000Z',
    totalEvents: 2,
    clustersEvaluated: 2,
    candidates: [
      {
        candidateId: 'cand-fresh',
        kind: 'pattern',
        title: 'fresh',
        summary: 'fresh',
        clusterKey: 'k1',
        salienceScore: 9,
        salienceFactors: { severity: 1, recurrenceCount: 1, crossModuleBreadth: 1, riskScore: 1, persistenceAcrossRuns: 1, ownershipDocsGap: 0, novelSuccessfulRemediationShape: 1 },
        fingerprint: 'fp-1',
        module: 'module-a',
        ruleId: 'RULE-1',
        failureShape: 'shape-1',
        eventCount: 1,
        provenance: [
          { eventId: 'event-1', sourcePath: 'events/event-1.json', fingerprint: 'fp-1', runId: null }
        ],
        lastSeenAt: '2026-01-02T00:00:00.000Z'
      },
      {
        candidateId: 'cand-stale',
        kind: 'decision',
        title: 'stale',
        summary: 'stale',
        clusterKey: 'k2',
        salienceScore: 1,
        salienceFactors: { severity: 1, recurrenceCount: 1, crossModuleBreadth: 1, riskScore: 1, persistenceAcrossRuns: 1, ownershipDocsGap: 0, novelSuccessfulRemediationShape: 0 },
        fingerprint: 'fp-2',
        module: 'module-a',
        ruleId: 'RULE-1',
        failureShape: 'shape-2',
        eventCount: 1,
        provenance: [
          { eventId: 'event-2', sourcePath: 'events/event-2.json', fingerprint: 'fp-2', runId: null }
        ],
        lastSeenAt: '2025-01-01T00:00:00.000Z'
      }
    ]
  });

  writeJson(path.join(root, '.playbook/memory/knowledge/patterns.json'), {
    schemaVersion: '1.0',
    artifact: 'memory-knowledge',
    kind: 'pattern',
    generatedAt: '2026-01-03T00:00:00.000Z',
    entries: [
      {
        knowledgeId: 'pattern-active',
        candidateId: 'cand-fresh',
        kind: 'pattern',
        title: 'active',
        summary: 'active',
        fingerprint: 'fp-1',
        module: 'module-a',
        ruleId: 'RULE-1',
        failureShape: 'shape-1',
        promotedAt: '2026-01-03T00:00:00.000Z',
        provenance: [],
        status: 'active',
        supersedes: [],
        supersededBy: []
      },
      {
        knowledgeId: 'pattern-superseded',
        candidateId: 'cand-stale',
        kind: 'pattern',
        title: 'superseded',
        summary: 'superseded',
        fingerprint: 'fp-2',
        module: 'module-a',
        ruleId: 'RULE-1',
        failureShape: 'shape-2',
        promotedAt: '2025-01-01T00:00:00.000Z',
        provenance: [],
        status: 'superseded',
        supersedes: [],
        supersededBy: ['pattern-active']
      }
    ]
  });

  return root;
};

describe('memory inspection helpers', () => {
  it('returns timeline in deterministic chronological order', () => {
    const root = setupRepo();

    const asc = lookupMemoryEventTimeline(root, { order: 'asc' });
    const desc = lookupMemoryEventTimeline(root, { order: 'desc' });

    expect(asc.map((event) => event.eventInstanceId)).toEqual(['event-1', 'event-2']);
    expect(desc.map((event) => event.eventInstanceId)).toEqual(['event-2', 'event-1']);
  });

  it('expands provenance with resolved event payloads', () => {
    const root = setupRepo();
    const candidates = lookupMemoryCandidateKnowledge(root, { includeStale: true });

    const expanded = expandMemoryProvenance(root, candidates[0]?.provenance ?? []);

    expect(expanded).toHaveLength(1);
    expect(expanded[0]?.event?.eventInstanceId).toBe('event-1');
    expect(expanded[0]?.event?.kind).toBe('verify_run');
  });

  it('keeps candidate and promoted knowledge surfaces separate', () => {
    const root = setupRepo();

    const candidates = lookupMemoryCandidateKnowledge(root, { includeStale: true });
    const promoted = lookupPromotedMemoryKnowledge(root, { includeSuperseded: true });

    expect(candidates.map((entry) => entry.candidateId)).toEqual(['cand-fresh', 'cand-stale']);
    expect(promoted.map((entry) => entry.knowledgeId)).toEqual(['pattern-active', 'pattern-superseded']);
  });

  it('excludes stale candidates and superseded promoted knowledge by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-20T00:00:00.000Z'));
    const root = setupRepo();

    const candidates = lookupMemoryCandidateKnowledge(root);
    const promoted = lookupPromotedMemoryKnowledge(root);

    expect(candidates.map((entry) => entry.candidateId)).toEqual(['cand-fresh']);
    expect(promoted.map((entry) => entry.knowledgeId)).toEqual(['pattern-active']);

    vi.useRealTimers();
  });
});
