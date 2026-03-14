import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';
import { runSecurity } from './security.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const writeSecurityBaseline = (repo: string): void => {
  const artifactPath = path.join(repo, '.playbook', 'security-baseline.json');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        schemaVersion: '1.0',
        kind: 'security-baseline',
        generatedAt: '2026-01-01T00:00:00.000Z',
        findings: [
          {
            package_name: 'zlib',
            installed_version: '1.2.0',
            ecosystem: 'npm',
            vulnerability_id: 'CVE-0002',
            severity: 'medium',
            dependency_path: 'app > zlib',
            direct_or_transitive: 'transitive',
            status: 'transitive'
          },
          {
            package_name: 'axios',
            installed_version: '0.1.0',
            ecosystem: 'npm',
            vulnerability_id: 'CVE-0001',
            severity: 'high',
            dependency_path: 'axios',
            direct_or_transitive: 'direct',
            status: 'direct'
          }
        ]
      },
      null,
      2
    )
  );
};

describe('runSecurity', () => {
  it('prints summary for baseline findings', async () => {
    const repo = createRepo('playbook-cli-security-summary');
    writeSecurityBaseline(repo);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runSecurity(repo, ['baseline', 'summary'], { format: 'text', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      'Security baseline summary',
      '────────────────────────',
      'Generated at: 2026-01-01T00:00:00.000Z',
      'Total findings: 2',
      'By status:',
      '- direct: 1',
      '- transitive: 1',
      '- tooling-only: 0',
      '- false-positive: 0',
      '- untriaged: 0',
      'By severity:',
      '- high: 1',
      '- medium: 1'
    ]);

    logSpy.mockRestore();
  });
});

describe('command registry', () => {
  it('registers the security command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'security');

    expect(command).toBeDefined();
    expect(command?.description).toBe('Inspect deterministic security baseline findings and summary');
  });
});
