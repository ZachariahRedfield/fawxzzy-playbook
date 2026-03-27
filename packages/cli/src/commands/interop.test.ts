import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';
import { runInterop } from './interop.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-interop-cli-'));

const writeJson = (repo: string, relativePath: string, value: unknown): void => {
  const absolute = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, JSON.stringify(value, null, 2));
};

describe('runInterop', () => {
  it('registers capability and exposes inspect surfaces', async () => {
    const repo = createRepo();
    const registerExit = await runInterop(repo, ['register', '--capability', 'lifeline-remediation-v1', '--worker', 'lifeline-mock-1', '--actions', 'test-autofix'], { format: 'json', quiet: false });
    expect(registerExit).toBe(ExitCode.Success);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const inspectExit = await runInterop(repo, ['inspect', '--surface', 'capabilities'], { format: 'json', quiet: false });
    const payload = JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as { payload: { capabilities: Array<{ capabilityId: string }> } };

    expect(inspectExit).toBe(ExitCode.Success);
    expect(payload.payload.capabilities[0]?.capabilityId).toBe('lifeline-remediation-v1');
  });

  it('emits bounded request only when rendezvous is release-ready', async () => {
    const repo = createRepo();
    await runInterop(repo, ['register', '--capability', 'lifeline-remediation-v1', '--worker', 'lifeline-mock-1', '--actions', 'test-autofix'], { format: 'json', quiet: false });

    writeJson(repo, '.playbook/rendezvous-manifest.json', {
      schemaVersion: '1.0',
      kind: 'artifact-rendezvous-manifest',
      generatedAt: '2026-01-01T00:00:00.000Z',
      baseSha: 'abc123',
      remediationId: 'run-1:sig-a',
      requiredArtifactIds: ['test-autofix'],
      artifacts: {
        'test-autofix': {
          artifactId: 'test-autofix',
          path: '.playbook/test-autofix.json',
          sha256: 'abc',
          verification: 'passed'
        }
      },
      blockers: [],
      confidence: 1,
      staleOnShaChange: true
    });

    const emitExit = await runInterop(repo, ['emit', '--action', 'test-autofix', '--request-id', 'req-1', '--idempotency-key', 'req:1'], { format: 'json', quiet: false });
    expect(emitExit).toBe(ExitCode.Success);

    const store = JSON.parse(fs.readFileSync(path.join(repo, '.playbook/remediation-interop-store.json'), 'utf8')) as { requests: Array<{ requestId: string; state: string }> };
    expect(store.requests.find((entry) => entry.requestId === 'req-1')?.state).toBe('pending');
  });

  it('registers interop command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'interop');
    expect(command).toBeDefined();
  });
});
