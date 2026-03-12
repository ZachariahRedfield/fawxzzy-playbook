import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { runMemory } from './memory.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

describe('runMemory', () => {
  it('promotes from candidate with JSON output', async () => {
    const repo = createRepo('playbook-cli-memory-promote');
    const candidatesPath = path.join(repo, '.playbook/knowledge/candidates.json');
    fs.mkdirSync(path.dirname(candidatesPath), { recursive: true });
    fs.writeFileSync(
      candidatesPath,
      JSON.stringify(
        {
          schemaVersion: '1.0',
          command: 'learn-draft',
          baseRef: 'main',
          baseSha: 'a',
          headSha: 'b',
          diffContext: true,
          changedFiles: [],
          candidates: [
            {
              candidateId: 'cand-1',
              theme: 'decision-log',
              evidence: [{ path: 'docs/decision.md' }],
              dedupe: { kind: 'none' }
            }
          ]
        },
        null,
        2
      )
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitCode = await runMemory(repo, ['promote', '--from-candidate', 'cand-1'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.command).toBe('memory.promote');
    expect(fs.existsSync(path.join(repo, '.playbook/memory/knowledge/decisions.json'))).toBe(true);

    logSpy.mockRestore();
  });

  it('prunes with JSON output', async () => {
    const repo = createRepo('playbook-cli-memory-prune');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runMemory(repo, ['prune'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.command).toBe('memory.prune');

    logSpy.mockRestore();
  });
});
