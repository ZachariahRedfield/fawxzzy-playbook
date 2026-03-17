import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateSystemMapArtifact, writeSystemMapArtifact } from '../src/diagrams/systemMap.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-system-map-'));

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
            artifacts: ['.playbook/cycle-state.json', '.playbook/cycle-history.json']
          },
          {
            name: 'improvement_engine',
            purpose: 'Detect recurring inefficiencies',
            commands: ['improve', 'policy'],
            artifacts: ['.playbook/policy-evaluation.json']
          },
          {
            name: 'change_bridge',
            purpose: 'Governed mutation flow',
            commands: ['apply'],
            artifacts: ['.playbook/policy-apply-result.json']
          },
          {
            name: 'repository_memory',
            purpose: 'Persistent execution history',
            commands: ['session', 'analyze-pr', 'review-pr'],
            artifacts: ['.playbook/session.json', '.playbook/pr-review.json']
          }
        ]
      },
      null,
      2
    )
  );
};

describe('system map artifact', () => {
  it('generates deterministic ordered layers/nodes/edges', () => {
    const repo = createRepo();
    writeArchitecture(repo);

    const first = generateSystemMapArtifact(repo);
    const second = generateSystemMapArtifact(repo);

    expect(second).toEqual(first);
    expect(first.kind).toBe('system-map');
    expect(first.layers.map((layer) => layer.id)).toEqual(['observer', 'control', 'runtime', 'review', 'evidence', 'artifacts', 'core']);
    expect(first.nodes.some((node) => node.id === 'cycle' && node.layer === 'runtime')).toBe(true);
    expect(first.edges).toContainEqual({ from: 'cycle', to: 'cycle-state' });
    expect(first.edges).toContainEqual({ from: 'observer-server', to: 'session' });
  });

  it('writes .playbook/system-map.json with stable formatting', () => {
    const repo = createRepo();
    writeArchitecture(repo);

    const { artifactPath, artifact } = writeSystemMapArtifact(repo);
    const raw = fs.readFileSync(artifactPath, 'utf8');
    const parsed = JSON.parse(raw) as typeof artifact;

    expect(path.relative(repo, artifactPath)).toBe('.playbook/system-map.json');
    expect(raw.endsWith('\n')).toBe(true);
    expect(parsed).toEqual(artifact);
  });
});
