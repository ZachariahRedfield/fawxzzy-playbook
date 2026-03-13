import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';

const knowledgeList = vi.fn();
const knowledgeQuery = vi.fn();
const knowledgeInspect = vi.fn();
const knowledgeTimeline = vi.fn();
const knowledgeProvenance = vi.fn();
const knowledgeStale = vi.fn();

vi.mock('@zachariahredfield/playbook-engine', () => ({
  knowledgeList,
  knowledgeQuery,
  knowledgeInspect,
  knowledgeTimeline,
  knowledgeProvenance,
  knowledgeStale
}));

describe('runKnowledge', () => {
  it('supports list and emits json output', async () => {
    const { runKnowledge } = await import('./knowledge.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    knowledgeList.mockReturnValue({
      schemaVersion: '1.0',
      command: 'knowledge-list',
      filters: {},
      summary: { total: 1, byType: {}, byStatus: {} },
      knowledge: [{ id: 'event-1' }]
    });

    const exitCode = await runKnowledge('/repo', ['list'], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.Success);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.command).toBe('knowledge-list');
    expect(payload.knowledge).toHaveLength(1);
    logSpy.mockRestore();
  });

  it('supports query filters', async () => {
    const { runKnowledge } = await import('./knowledge.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    knowledgeQuery.mockReturnValue({
      schemaVersion: '1.0',
      command: 'knowledge-query',
      filters: { type: 'candidate' },
      summary: { total: 1, byType: {}, byStatus: {} },
      knowledge: [{ id: 'cand-1', type: 'candidate' }]
    });

    const exitCode = await runKnowledge('/repo', ['query', '--type', 'candidate'], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.Success);
    expect(knowledgeQuery).toHaveBeenCalledWith('/repo', expect.objectContaining({ type: 'candidate' }));

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.command).toBe('knowledge-query');
    logSpy.mockRestore();
  });

  it('supports inspect and provenance subcommands', async () => {
    const { runKnowledge } = await import('./knowledge.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    knowledgeInspect.mockReturnValue({
      schemaVersion: '1.0',
      command: 'knowledge-inspect',
      id: 'pattern-1',
      knowledge: { id: 'pattern-1', type: 'promoted' }
    });

    let exitCode = await runKnowledge('/repo', ['inspect', 'pattern-1'], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.Success);

    let payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.command).toBe('knowledge-inspect');

    knowledgeProvenance.mockReturnValue({
      schemaVersion: '1.0',
      command: 'knowledge-provenance',
      id: 'pattern-1',
      provenance: { record: { id: 'pattern-1' }, evidence: [{ id: 'event-1' }], relatedRecords: [{ id: 'cand-1' }] }
    });

    logSpy.mockClear();
    exitCode = await runKnowledge('/repo', ['provenance', 'pattern-1'], { format: 'json', quiet: false });
    expect(exitCode).toBe(ExitCode.Success);

    payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.command).toBe('knowledge-provenance');
    logSpy.mockRestore();
  });
});
