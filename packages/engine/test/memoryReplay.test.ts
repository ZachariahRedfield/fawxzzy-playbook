import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { replayMemoryToCandidates } from '../src/memory/replay.js';

const setupFixtureRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-memory-replay-'));
  const fixtureRoot = path.join(process.cwd(), 'test/__fixtures__/memory-replay');

  fs.mkdirSync(path.join(root, '.playbook/memory/events'), { recursive: true });
  fs.copyFileSync(path.join(fixtureRoot, 'index.json'), path.join(root, '.playbook/memory/index.json'));

  const eventsDir = path.join(fixtureRoot, 'events');
  for (const fileName of fs.readdirSync(eventsDir)) {
    fs.copyFileSync(path.join(eventsDir, fileName), path.join(root, '.playbook/memory/events', fileName));
  }

  return root;
};

describe('replayMemoryToCandidates', () => {
  it('clusters replay events by event fingerprint', () => {
    const root = setupFixtureRepo();

    const output = replayMemoryToCandidates(root);

    expect(output.totalEvents).toBe(4);
    expect(output.clustersEvaluated).toBe(2);
    expect(output.candidates.map((candidate) => candidate.fingerprint)).toEqual(['fp-notes', 'fp-tests']);
    expect(output.candidates[0]?.eventCount).toBe(2);
    expect(output.candidates[0]?.provenance.map((entry) => entry.eventId)).toEqual(['evt-plan-1', 'evt-verify-1']);
  });

  it('keeps stable deterministic salience ranking', () => {
    const root = setupFixtureRepo();

    const first = replayMemoryToCandidates(root);
    const second = replayMemoryToCandidates(root);

    expect(second.candidates).toEqual(first.candidates);
    expect(second.candidates.map((candidate) => candidate.salienceScore)).toEqual(
      first.candidates.map((candidate) => candidate.salienceScore)
    );
    expect(first.candidates.map((candidate) => candidate.kind)).toEqual(['open_question', 'pattern']);
  });

  it('writes deterministic candidate artifact output', () => {
    const root = setupFixtureRepo();
    const output = replayMemoryToCandidates(root);

    const written = JSON.parse(
      fs.readFileSync(path.join(root, '.playbook/memory/candidates.json'), 'utf8')
    ) as typeof output;

    expect(written.command).toBe('memory-replay');
    expect(written.candidates.map((candidate) => candidate.candidateId)).toEqual(
      output.candidates.map((candidate) => candidate.candidateId)
    );
  });

  it('adds supersession metadata when prior candidate lineage exists', () => {
    const root = setupFixtureRepo();

    const baseline = replayMemoryToCandidates(root);
    const priorNotesCandidate = baseline.candidates.find((candidate) => candidate.fingerprint === 'fp-notes');
    if (!priorNotesCandidate) {
      throw new Error('missing fixture candidate for fp-notes');
    }

    const candidatesPath = path.join(root, '.playbook/memory/candidates.json');
    const priorArtifact = JSON.parse(fs.readFileSync(candidatesPath, 'utf8')) as {
      candidates: Array<Record<string, unknown>>;
    };

    priorArtifact.candidates = priorArtifact.candidates.map((candidate) => {
      if (candidate.fingerprint !== 'fp-notes') {
        return candidate;
      }
      return {
        ...candidate,
        candidateId: 'legacy-notes-candidate'
      };
    });

    fs.writeFileSync(candidatesPath, `${JSON.stringify(priorArtifact, null, 2)}\n`, 'utf8');

    const rerun = replayMemoryToCandidates(root);
    const notesCandidate = rerun.candidates.find((candidate) => candidate.fingerprint === 'fp-notes');

    expect(notesCandidate?.candidateId).toBe(priorNotesCandidate.candidateId);
    expect(notesCandidate?.supersession.priorCandidateIds).toContain('legacy-notes-candidate');
    expect(notesCandidate?.supersession.supersedesCandidateIds).toContain('legacy-notes-candidate');
    expect(notesCandidate?.supersession.evolutionOrdinal).toBe(2);
  });
});
