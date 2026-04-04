import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAutomationSuggestionsArtifact, validateAutomationSuggestion } from './automationSuggestions.js';

const touchedDirs: string[] = [];

const createTempRepo = (): string => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-automation-suggestions-'));
  touchedDirs.push(repoRoot);
  return repoRoot;
};

const writeJson = (repoRoot: string, relativePath: string, payload: unknown): void => {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

afterEach(() => {
  while (touchedDirs.length > 0) {
    const directory = touchedDirs.pop();
    if (directory && fs.existsSync(directory)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('buildAutomationSuggestionsArtifact', () => {
  it('is deterministic for identical promoted knowledge inputs', () => {
    const repoRoot = createTempRepo();
    writeJson(repoRoot, '.playbook/memory/knowledge/patterns.json', {
      schemaVersion: '1.0',
      artifact: 'memory-knowledge',
      kind: 'pattern',
      generatedAt: '2026-03-01T00:00:00.000Z',
      entries: [
        {
          knowledgeId: 'k-pattern-1',
          candidateId: 'c-pattern-1',
          sourceCandidateIds: ['c-pattern-1'],
          sourceEventFingerprints: ['fp-1'],
          kind: 'pattern',
          title: 'Deterministic knowledge pattern',
          summary: 'Promoted insight.',
          fingerprint: 'knowledge-fp-1',
          module: 'engine',
          ruleId: 'engine.rule',
          failureShape: 'shape',
          promotedAt: '2026-02-20T00:00:00.000Z',
          provenance: [
            {
              eventId: 'event-1',
              sourcePath: 'docs/postmortems/pattern.md',
              fingerprint: 'prov-fp-1'
            }
          ],
          status: 'active',
          supersedes: [],
          supersededBy: []
        }
      ]
    });

    const generatedAt = '2026-03-24T00:00:00.000Z';
    const left = buildAutomationSuggestionsArtifact(repoRoot, { generatedAt, approvedPolicyPackRefs: ['.playbook/policy/review-pack.json'] });
    const right = buildAutomationSuggestionsArtifact(repoRoot, { generatedAt, approvedPolicyPackRefs: ['.playbook/policy/review-pack.json'] });

    expect(left).toEqual(right);
  });

  it('excludes unreviewed candidate knowledge as an input surface', () => {
    const repoRoot = createTempRepo();
    writeJson(repoRoot, '.playbook/memory/candidates.json', {
      schemaVersion: '1.0',
      kind: 'playbook-memory-replay',
      generatedAt: '2026-03-24T00:00:00.000Z',
      candidates: [
        {
          candidateId: 'candidate-should-not-appear',
          kind: 'pattern',
          module: 'engine',
          ruleId: 'engine.rule',
          failureShape: 'shape',
          title: 'Unreviewed',
          summary: 'Should not be used',
          fingerprint: 'candidate-fingerprint',
          provenance: [
            {
              eventId: 'event-candidate',
              sourcePath: 'docs/postmortems/candidate.md',
              fingerprint: 'candidate-prov'
            }
          ]
        }
      ]
    });

    const artifact = buildAutomationSuggestionsArtifact(repoRoot, { generatedAt: '2026-03-24T00:00:00.000Z' });

    expect(artifact.suggestions).toEqual([]);
    expect(artifact.rejectedSuggestions[0]?.reasonCode).toBe('candidate-knowledge-input');
    expect(artifact.validationSummary.failClosed).toBe(true);
    expect(artifact.inputs.excludedSources).toContain('unreviewed-candidate-knowledge');
  });

  it('rejects stale/superseded knowledge without audited override', () => {
    const repoRoot = createTempRepo();
    writeJson(repoRoot, '.playbook/memory/knowledge/patterns.json', {
      schemaVersion: '1.0',
      artifact: 'memory-knowledge',
      kind: 'pattern',
      generatedAt: '2026-03-03T00:00:00.000Z',
      entries: [
        {
          knowledgeId: 'k-pattern-stale',
          candidateId: 'c-pattern-stale',
          sourceCandidateIds: ['c-pattern-stale'],
          sourceEventFingerprints: ['fp-pattern-stale'],
          kind: 'pattern',
          title: 'Old doctrine',
          summary: 'too old',
          fingerprint: 'knowledge-fp-old',
          module: 'engine',
          ruleId: 'engine.rule',
          failureShape: 'shape',
          promotedAt: '2025-01-01T00:00:00.000Z',
          provenance: [{ eventId: 'event-old', sourcePath: 'docs/old.md', fingerprint: 'prov-old' }],
          status: 'active',
          supersedes: [],
          supersededBy: []
        },
        {
          knowledgeId: 'k-pattern-superseded',
          candidateId: 'c-pattern-superseded',
          sourceCandidateIds: ['c-pattern-superseded'],
          sourceEventFingerprints: ['fp-pattern-superseded'],
          kind: 'pattern',
          title: 'Superseded doctrine',
          summary: 'superseded',
          fingerprint: 'knowledge-fp-superseded',
          module: 'engine',
          ruleId: 'engine.rule',
          failureShape: 'shape',
          promotedAt: '2026-03-01T00:00:00.000Z',
          provenance: [{ eventId: 'event-new', sourcePath: 'docs/new.md', fingerprint: 'prov-new' }],
          status: 'superseded',
          supersedes: [],
          supersededBy: ['k-new']
        }
      ]
    });

    const artifact = buildAutomationSuggestionsArtifact(repoRoot, {
      generatedAt: '2026-03-24T00:00:00.000Z',
      staleAfterDays: 45
    });

    expect(artifact.suggestions).toHaveLength(0);
    expect(artifact.rejectedSuggestions.map((entry) => entry.reasonCode)).toEqual([
      'stale-without-audited-override',
      'superseded-or-retired-knowledge'
    ]);
  });

  it('rejects malformed provenance as provenance-free inferred input', () => {
    const repoRoot = createTempRepo();
    writeJson(repoRoot, '.playbook/memory/knowledge/decisions.json', {
      schemaVersion: '1.0',
      artifact: 'memory-knowledge',
      kind: 'decision',
      generatedAt: '2026-03-03T00:00:00.000Z',
      entries: [
        {
          knowledgeId: 'k-provenance-bad',
          candidateId: 'c-provenance-bad',
          sourceCandidateIds: ['c-provenance-bad'],
          sourceEventFingerprints: ['fp-provenance-bad'],
          kind: 'decision',
          title: 'Broken provenance',
          summary: 'missing provenance fields',
          fingerprint: 'knowledge-fp-bad',
          module: 'docs',
          ruleId: 'docs.rule',
          failureShape: 'shape',
          promotedAt: '2026-03-01T00:00:00.000Z',
          provenance: [{ eventId: '', sourcePath: '', fingerprint: '' }],
          status: 'active',
          supersedes: [],
          supersededBy: []
        }
      ]
    });

    const artifact = buildAutomationSuggestionsArtifact(repoRoot, {
      generatedAt: '2026-03-24T00:00:00.000Z'
    });
    expect(artifact.suggestions).toHaveLength(0);
    expect(artifact.rejectedSuggestions[0]?.reasonCode).toBe('missing-provenance');
  });

  it('preserves provenance and freshness metadata on emitted rows', () => {
    const repoRoot = createTempRepo();
    writeJson(repoRoot, '.playbook/memory/knowledge/decisions.json', {
      schemaVersion: '1.0',
      artifact: 'memory-knowledge',
      kind: 'decision',
      generatedAt: '2026-03-03T00:00:00.000Z',
      entries: [
        {
          knowledgeId: 'k-decision-1',
          candidateId: 'c-decision-1',
          sourceCandidateIds: ['c-decision-1'],
          sourceEventFingerprints: ['fp-decision-1'],
          kind: 'decision',
          title: 'Promoted decision',
          summary: 'Decision summary.',
          fingerprint: 'knowledge-fp-2',
          module: 'docs',
          ruleId: 'docs.rule',
          failureShape: 'shape',
          promotedAt: '2026-03-01T00:00:00.000Z',
          provenance: [
            {
              eventId: 'event-a',
              sourcePath: 'docs/architecture/decisions/ad-1.md',
              fingerprint: 'prov-a'
            }
          ],
          status: 'active',
          supersedes: [],
          supersededBy: []
        }
      ]
    });

    const artifact = buildAutomationSuggestionsArtifact(repoRoot, {
      generatedAt: '2026-03-24T00:00:00.000Z',
      staleAfterDays: 45
    });

    expect(artifact.suggestions).toHaveLength(1);
    expect(artifact.suggestions[0]?.provenanceRefs).toEqual([
      {
        knowledgeId: 'k-decision-1',
        eventId: 'event-a',
        sourcePath: 'docs/architecture/decisions/ad-1.md',
        fingerprint: 'prov-a'
      }
    ]);
    expect(artifact.suggestions[0]?.freshness).toEqual({
      promotedAt: '2026-03-01T00:00:00.000Z',
      knowledgeGeneratedAt: '2026-03-03T00:00:00.000Z',
      ageDays: 23,
      stale: false
    });
  });

  it('keeps the artifact proposal-only and read-only', () => {
    const repoRoot = createTempRepo();
    const artifact = buildAutomationSuggestionsArtifact(repoRoot, { generatedAt: '2026-03-24T00:00:00.000Z' });

    expect(artifact.proposalOnly).toBe(true);
    expect(artifact.authority).toBe('read-only');
    expect(fs.existsSync(path.join(repoRoot, '.playbook/automation-suggestions.json'))).toBe(false);
  });

  it('fails closed when rollback/deactivation accountability metadata is missing', () => {
    const failure = validateAutomationSuggestion({
      suggestionId: 'suggestion.test.1',
      sourceKnowledgeRefs: ['knowledge:k1'],
      suggestedAutomationPattern: 'pattern-conformance-template',
      rationale: 'rationale',
      confidence: 0.8,
      riskSummary: { level: 'low', summary: 'summary' },
      rollbackAccountability: {
        owner: 'governance-reviewer',
        rollbackPlan: '',
        accountabilityRefs: []
      },
      provenanceRefs: [{ knowledgeId: 'k1', eventId: 'evt-1', sourcePath: 'docs/a.md', fingerprint: 'fp-1' }],
      freshness: {
        promotedAt: '2026-03-01T00:00:00.000Z',
        knowledgeGeneratedAt: '2026-03-02T00:00:00.000Z',
        ageDays: 1,
        stale: false
      }
    }, {
      knowledgeId: 'k1',
      candidateId: 'c1',
      sourceCandidateIds: ['c1'],
      sourceEventFingerprints: ['fp-1'],
      kind: 'pattern',
      title: 't',
      summary: 's',
      fingerprint: 'knowledge-fp',
      module: 'engine',
      ruleId: 'engine.rule',
      failureShape: 'shape',
      promotedAt: '2026-03-01T00:00:00.000Z',
      provenance: [{ eventId: 'evt-1', sourcePath: 'docs/a.md', fingerprint: 'fp-1' }],
      status: 'active',
      supersedes: [],
      supersededBy: [],
      _knowledgeGeneratedAt: '2026-03-02T00:00:00.000Z',
      _sourcePath: '.playbook/memory/knowledge/patterns.json'
    }, false);

    expect(failure?.reasonCode).toBe('missing-rollback-accountability');
  });
});
