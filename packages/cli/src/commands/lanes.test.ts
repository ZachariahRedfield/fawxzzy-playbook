import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';
import { runLanes } from './lanes/index.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
const repoRoot = path.resolve(import.meta.dirname, '../../../..');

describe('runLanes', () => {
  it('derives lane-state from workset plan and writes artifact', async () => {
    const repo = createRepo('playbook-cli-lanes');
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    fs.copyFileSync(
      path.join(repoRoot, 'tests/contracts/workset-plan.fixture.json'),
      path.join(repo, '.playbook', 'workset-plan.json')
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitCode = await runLanes(repo, { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    expect(fs.existsSync(path.join(repo, '.playbook', 'lane-state.json'))).toBe(true);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { command: string; lane_state: { kind: string } };
    expect(payload.command).toBe('lanes');
    expect(payload.lane_state.kind).toBe('lane-state');

    logSpy.mockRestore();
  });

  it('returns deterministic missing-workset error in json mode', async () => {
    const repo = createRepo('playbook-cli-lanes-missing');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runLanes(repo, { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Failure);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { command: string; error: string };
    expect(payload.command).toBe('lanes');
    expect(payload.error).toContain('missing workset plan');

    logSpy.mockRestore();
  });
});

describe('command registry', () => {
  it('registers the lanes command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'lanes');
    expect(command).toBeDefined();
    expect(command?.description).toBe('Derive deterministic lane-state from .playbook/workset-plan.json');
  });
});
