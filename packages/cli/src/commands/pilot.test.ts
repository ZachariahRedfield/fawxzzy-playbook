import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';
import { runPilot } from './pilot.js';

describe('runPilot', () => {
  it('runs baseline flow and writes deterministic artifacts for target repo', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-pilot-'));
    const targetRepo = path.join(root, 'target');
    fs.mkdirSync(path.join(targetRepo, 'src'), { recursive: true });
    fs.writeFileSync(path.join(targetRepo, 'package.json'), JSON.stringify({ name: 'target', version: '0.0.1' }, null, 2));
    fs.writeFileSync(path.join(targetRepo, 'src', 'index.ts'), 'export const ok = true;\n');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runPilot('/workspace/playbook', ['--repo', targetRepo], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);

    const summary = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { command: string; artifactPathsWritten: Record<string, string> };
    expect(summary.command).toBe('pilot');

    const findingsPath = path.join(targetRepo, '.playbook', 'findings.json');
    const planPath = path.join(targetRepo, '.playbook', 'plan.json');
    const summaryPath = path.join(targetRepo, '.playbook', 'pilot-summary.json');

    expect(() => JSON.parse(fs.readFileSync(findingsPath, 'utf8'))).not.toThrow();
    expect(() => JSON.parse(fs.readFileSync(planPath, 'utf8'))).not.toThrow();
    expect(() => JSON.parse(fs.readFileSync(summaryPath, 'utf8'))).not.toThrow();

    logSpy.mockRestore();
  });

  it('registers pilot command metadata in CLI command list', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'pilot');
    expect(command).toBeDefined();
  });
});
