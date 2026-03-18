import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { runStory } from './story.js';

const tempDirs: string[] = [];
const makeRepo = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-story-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('runStory', () => {
  it('creates, lists, shows, derives candidates, promotes, and updates stories', async () => {
    const repo = makeRepo();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    let exitCode = await runStory(repo, ['create', '--id', 'story-1', '--title', 'Backlog MVP', '--type', 'feature', '--source', 'manual', '--severity', 'medium', '--priority', 'high', '--confidence', 'high', '--rationale', 'Need durable planning', '--acceptance', 'List stories', '--acceptance', 'Update stories', '--evidence', 'objective'], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.Success);
    let payload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(payload.promotion.promoted).toBe(true);
    expect(payload.story.id).toBe('story-1');

    logSpy.mockClear();
    exitCode = await runStory(repo, ['list'], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.Success);
    payload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(payload.stories).toHaveLength(1);

    logSpy.mockClear();
    exitCode = await runStory(repo, ['show', 'story-1'], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.Success);
    payload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(payload.story.title).toBe('Backlog MVP');

    fs.writeFileSync(path.join(repo, '.playbook/improvement-candidates.json'), JSON.stringify({
      schemaVersion: '1.0',
      kind: 'improvement-candidates',
      generatedAt: '2026-01-01T00:00:00.000Z',
      thresholds: { minimum_recurrence: 3, minimum_confidence: 0.6 },
      sourceArtifacts: { memoryEventsPath: '', learningStatePath: '', memoryEventCount: 0, learningStateAvailable: false },
      summary: { AUTO_SAFE: 0, CONVERSATIONAL: 0, GOVERNANCE: 1, total: 1 },
      router_recommendations: { recommendations: [], rejected_recommendations: [] },
      doctrine_candidates: { candidates: [], source_artifacts: [], generated_at: '2026-01-01T00:00:00.000Z', kind: 'knowledge-candidates', schemaVersion: '1.0' },
      doctrine_promotions: { transitions: [], generated_at: '2026-01-01T00:00:00.000Z', kind: 'knowledge-promotions', schemaVersion: '1.0' },
      command_improvements: { runtime_hardening: { proposals: [], rejected_proposals: [], open_questions: [] }, proposals: [], rejected_proposals: [] },
      opportunity_analysis: { top_recommendation: null, secondary_queue: [] },
      candidates: [{ candidate_id: 'candidate-a', category: 'routing', observation: 'Docs route recurs', recurrence_count: 3, confidence_score: 0.75, suggested_action: 'stabilize docs route', gating_tier: 'GOVERNANCE', improvement_tier: 'governance', required_review: true, blocking_reasons: [], evidence: { event_ids: ['evt-1'] }, evidence_count: 3, supporting_runs: 2 }],
      rejected_candidates: []
    }, null, 2));

    logSpy.mockClear();
    exitCode = await runStory(repo, ['candidates', '--explain'], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.Success);
    payload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(payload.candidates.length).toBeGreaterThanOrEqual(1);
    expect(payload.candidates[0].explanation.promotion.required).toBe(true);

    logSpy.mockClear();
    exitCode = await runStory(repo, ['promote', payload.candidates[0].candidate.candidate_id], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.Success);
    payload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(payload.story.id).toContain('story-');

    logSpy.mockClear();
    exitCode = await runStory(repo, ['status', 'story-1', '--status', 'ready'], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.Success);
    payload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(payload.story.status).toBe('ready');

    const artifact = JSON.parse(fs.readFileSync(path.join(repo, '.playbook/stories.json'), 'utf8')) as { stories: Array<{ status: string }> };
    expect(artifact.stories[0]?.status).toBe('ready');
  });

  it('preserves committed backlog state when promotion is blocked', async () => {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.playbook/stories.json'), JSON.stringify({
      schemaVersion: '1.0',
      repo: path.basename(repo),
      stories: [{
        id: 'story-1', repo: path.basename(repo), title: 'Existing', type: 'feature', source: 'manual', severity: 'medium', priority: 'high', confidence: 'high', status: 'proposed', evidence: [], rationale: 'Preserve committed state while validation blocks promotion', acceptance_criteria: [], dependencies: [], execution_lane: null, suggested_route: null
      }]
    }, null, 2));
    const before = fs.readFileSync(path.join(repo, '.playbook/stories.json'), 'utf8');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runStory(repo, ['status', 'story-1', '--status', 'not-real'], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.PolicyFailure);
    const payload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(payload.promotion.promoted).toBe(false);
    expect(payload.promotion.committed_state_preserved).toBe(true);
    expect(fs.readFileSync(path.join(repo, '.playbook/stories.json'), 'utf8')).toBe(before);
  });
});
