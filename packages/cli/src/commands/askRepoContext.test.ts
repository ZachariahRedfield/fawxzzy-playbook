import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { runAsk } from './ask.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));


const writeModuleDigest = (repo: string, moduleName: string): void => {
  const digestPath = path.join(repo, '.playbook', 'module-digests.json');
  fs.mkdirSync(path.dirname(digestPath), { recursive: true });
  fs.writeFileSync(
    digestPath,
    JSON.stringify(
      {
        schemaVersion: '1.0',
        kind: 'playbook-module-digests',
        modules: [
          {
            id: moduleName,
            summary: `Module ${moduleName} encapsulates bounded repository behavior with graph neighborhood out[governed_by], in[contains].`,
            dependencies: { direct: [], directCount: 0 },
            dependents: { direct: [], transitive: [], directCount: 0, transitiveCount: 0 },
            ownership: { area: 'unassigned', owners: [], status: 'no-metadata-configured', source: 'generated-default' },
            risk: { level: 'low', score: 0, signals: ['Low fan-in and limited transitive impact'] },
            keyReferences: { docs: [], contracts: ['docs/contracts/repository-graph-contract.md'], commands: [] },
            digest: { hash: 'abc', algorithm: 'sha256' },
            provenance: { indexArtifact: '.playbook/repo-index.json', graphArtifact: '.playbook/repo-graph.json', ownershipArtifact: 'generated-default' }
          }
        ]
      },
      null,
      2
    )
  );
};

const writeRepoIndex = (repo: string): void => {
  const indexPath = path.join(repo, '.playbook', 'repo-index.json');
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(
    indexPath,
    JSON.stringify(
      {
        schemaVersion: '1.0',
        framework: 'nextjs',
        language: 'typescript',
        architecture: 'modular-monolith',
        modules: [
          { name: 'users', dependencies: ['workouts'] },
          { name: 'workouts', dependencies: [] }
        ],
        database: 'supabase',
        rules: ['requireNotesOnChanges']
      },
      null,
      2
    )
  );
};

describe('ask --repo-context', () => {
  it('returns deterministic remediation guidance when repo index is missing', async () => {
    const repo = createRepo('playbook-cli-ask-repo-context-missing-index');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const exitCode = await runAsk(repo, ['what', 'modules', 'exist?'], {
      format: 'text',
      quiet: false,
      repoContext: true
    });

    expect(exitCode).toBe(ExitCode.Failure);
    expect(errorSpy).toHaveBeenCalledWith(
      'Repository context is not available yet.\nRun `playbook index` to generate .playbook/repo-index.json and retry.'
    );

    errorSpy.mockRestore();
  });


  it('composes --module with --repo-context for narrowed indexed context', async () => {
    const repo = createRepo('playbook-cli-ask-repo-context-module');
    writeRepoIndex(repo);
    writeModuleDigest(repo, 'workouts');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runAsk(repo, ['how', 'does', 'this', 'module', 'work?', '--module', 'workouts'], {
      format: 'json',
      quiet: false,
      repoContext: true,
      module: 'workouts'
    });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.repoContext.enabled).toBe(true);
    expect(payload.context.module.module.name).toBe('workouts');
    expect(payload.context.sources).toContainEqual({ type: 'module', name: 'workouts' });
    expect(payload.context.sources).toContainEqual({ type: 'module-digest', path: '.playbook/module-digests.json' });
    expect(payload.context.sources).toContainEqual({ type: 'ai-contract', path: 'generated-ai-contract-fallback' });

    logSpy.mockRestore();
  });

  it('loads trusted context sources into JSON output metadata', async () => {
    const repo = createRepo('playbook-cli-ask-repo-context-json');
    writeRepoIndex(repo);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runAsk(repo, ['what', 'modules', 'exist?'], {
      format: 'json',
      quiet: false,
      repoContext: true,
      mode: 'concise'
    });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.mode).toBe('concise');
    expect(payload.repoContext).toEqual({
      enabled: true,
      sources: ['.playbook/repo-index.json', 'generated-ai-contract-fallback']
    });
    expect(payload.scope).toEqual({
      module: undefined,
      diffContext: {
        enabled: false,
        baseRef: undefined
      }
    });
    expect(String(payload.question)).toBe('what modules exist?');
    expect(payload.context.sources).toContainEqual({ type: 'repo-index', path: '.playbook/repo-index.json' });
    expect(payload.context.sources).toContainEqual({ type: 'repo-graph', path: '.playbook/repo-graph.json' });
    expect(payload.context.sources).toContainEqual({ type: 'ai-contract', path: 'generated-ai-contract-fallback' });

    logSpy.mockRestore();
  });
});
