import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { runDemo } from './demo.js';
import { listRegisteredCommands } from './index.js';

describe('runDemo', () => {
  it('prints deterministic text output', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runDemo(process.cwd(), { format: 'text', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Playbook Demo');
    expect(output).toContain('https://github.com/ZachariahRedfield/playbook-demo');
    expect(output).toContain('npx playbook analyze');
    expect(output).toContain('npx playbook verify');
    expect(output).toContain('5 deterministic findings on fresh clone');
    expect(output).toContain('final verify passes');

    logSpy.mockRestore();
  });

  it('returns deterministic json contract', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runDemo(process.cwd(), { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    expect(logSpy).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload).toMatchObject({
      schemaVersion: '1.0',
      command: 'demo',
      repository: {
        name: 'playbook-demo',
        url: 'https://github.com/ZachariahRedfield/playbook-demo'
      },
      expectedInitialFindings: {
        deterministicFindings: 5,
        firstVerifyPasses: false,
        fixAppliesSafeRemediations: true,
        finalVerifyPasses: true
      }
    });

    expect(payload.workflow).toEqual([
      'git clone https://github.com/ZachariahRedfield/playbook-demo',
      'cd playbook-demo',
      'npm install',
      'npx playbook analyze',
      'npx playbook verify',
      'npx playbook explain',
      'npx playbook fix',
      'npx playbook verify'
    ]);

    logSpy.mockRestore();
  });
});

describe('command registry', () => {
  it('registers the demo command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'demo');

    expect(command).toBeDefined();
    expect(command?.description).toBe(
      'Show the official Playbook demo repository and guided first-run workflow'
    );
  });
});
