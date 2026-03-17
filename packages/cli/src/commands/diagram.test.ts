import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDiagram } from './diagram.js';
import { ExitCode } from '../lib/cliContract.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-diagram-'));

const writeArchitecture = (repoRoot: string): void => {
  const registryPath = path.join(repoRoot, '.playbook', 'architecture', 'subsystems.json');
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(
    registryPath,
    JSON.stringify(
      {
        version: 1,
        subsystems: [
          {
            name: 'execution_supervisor',
            purpose: 'Run workers and monitor execution',
            commands: ['cycle'],
            artifacts: ['.playbook/cycle-state.json']
          }
        ]
      },
      null,
      2
    )
  );
};

describe('runDiagram', () => {
  it('writes canonical system map for `diagram system` target', async () => {
    const repo = createRepo();
    writeArchitecture(repo);

    const exitCode = await runDiagram(repo, {
      repo: '.',
      out: 'docs/ARCHITECTURE_DIAGRAMS.md',
      deps: false,
      structure: false,
      format: 'json',
      quiet: true,
      target: 'system'
    });

    expect(exitCode).toBe(ExitCode.Success);

    const artifactPath = path.join(repo, '.playbook', 'system-map.json');
    expect(fs.existsSync(artifactPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as { kind: string; schemaVersion: string };
    expect(parsed.kind).toBe('system-map');
    expect(parsed.schemaVersion).toBe('1.0');
  });
});
