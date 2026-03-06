import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';
import { runIndex } from './repoIndex.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

describe('runIndex', () => {
  it('creates .playbook/repo-index.json and prints a JSON contract', async () => {
    const repo = createRepo('playbook-cli-index');
    fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({}, null, 2));
    fs.mkdirSync(path.join(repo, 'src', 'features'), { recursive: true });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runIndex(repo, { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload).toEqual({
      command: 'index',
      ok: true,
      indexFile: '.playbook/repo-index.json',
      framework: 'node',
      architecture: 'modular-monolith',
      modules: ['features']
    });

    const indexFile = path.join(repo, '.playbook', 'repo-index.json');
    expect(fs.existsSync(indexFile)).toBe(true);

    const indexPayload = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    expect(indexPayload.schemaVersion).toBe('1.0');
    expect(indexPayload.modules).toEqual(['features']);

    logSpy.mockRestore();
  });
});

describe('command registry', () => {
  it('registers the index command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'index');

    expect(command).toBeDefined();
    expect(command?.description).toBe('Generate machine-readable repository intelligence index');
  });
});
