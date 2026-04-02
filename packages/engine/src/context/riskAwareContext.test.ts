import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRiskAwareContextSummary } from './riskAwareContext.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'risk-aware-context-'));

describe('buildRiskAwareContextSummary', () => {
  it('is deterministic for the same intelligence inputs', () => {
    const repo = createRepo();
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, '.playbook', 'module-digests.json'),
      `${JSON.stringify({
        schemaVersion: '1.0',
        kind: 'playbook-module-digests',
        modules: [
          {
            id: 'high-module',
            summary: 'high module summary',
            dependencies: { direct: ['a', 'b', 'c', 'd'], directCount: 4 },
            dependents: { direct: ['x', 'y'], transitive: ['x', 'y', 'z'], directCount: 2, transitiveCount: 3 },
            ownership: { area: 'platform', owners: ['team-a'], status: 'configured', source: '.playbook/module-owners.json' },
            risk: { level: 'high', score: 0.8, signals: ['hub', 'verify'] },
            keyReferences: { docs: ['docs/high.md'], contracts: [], commands: [] },
            digest: { hash: 'abc', algorithm: 'sha256' },
            provenance: { indexArtifact: '.playbook/repo-index.json', graphArtifact: '.playbook/repo-graph.json', ownershipArtifact: '.playbook/module-owners.json' }
          },
          {
            id: 'low-module',
            summary: 'low module summary',
            dependencies: { direct: ['a', 'b', 'c', 'd'], directCount: 4 },
            dependents: { direct: ['x', 'y', 'z', 'w'], transitive: ['x', 'y', 'z', 'w'], directCount: 4, transitiveCount: 4 },
            ownership: { area: 'docs', owners: ['team-b'], status: 'configured', source: '.playbook/module-owners.json' },
            risk: { level: 'low', score: 0.2, signals: ['stable', 'small'] },
            keyReferences: { docs: ['docs/low.md'], contracts: [], commands: [] },
            digest: { hash: 'def', algorithm: 'sha256' },
            provenance: { indexArtifact: '.playbook/repo-index.json', graphArtifact: '.playbook/repo-graph.json', ownershipArtifact: '.playbook/module-owners.json' }
          }
        ]
      }, null, 2)}\n`,
      'utf8'
    );

    const first = buildRiskAwareContextSummary(repo);
    const second = buildRiskAwareContextSummary(repo);

    expect(first).toEqual(second);
    expect(first?.modules.find((module) => module.module === 'high-module')?.contextDepth).toBe('rich');
    expect(first?.modules.find((module) => module.module === 'low-module')?.contextDepth).toBe('concise');
    expect(first?.modules.find((module) => module.module === 'low-module')?.context.dependents.transitive).toEqual([]);
  });
});
