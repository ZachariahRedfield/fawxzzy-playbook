import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateRuntimeManifests, materializeRuntimeManifestsArtifact } from './index.js';

const writeRuntimeManifest = (repoRoot: string, subappRoot: string, manifest: Record<string, unknown>): void => {
  const manifestPath = path.join(repoRoot, subappRoot, 'playbook', 'runtime-manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
};

describe('runtime manifest aggregation', () => {
  it('aggregates integrated manifests from subapps and examples/subapps deterministically', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-runtime-manifests-'));
    const manifest = {
      app_identity: 'example-app',
      runtime_role: 'producer',
      runtime_status: 'active',
      signal_groups: ['signals'],
      state_snapshot_types: ['snapshots'],
      bounded_action_families: ['actions'],
      receipt_families: ['receipts'],
      integration_seams: ['seam-a'],
      external_truth_contract_ref: 'fitness-contract'
    };
    writeRuntimeManifest(repoRoot, 'subapps/zeta-app', manifest);
    writeRuntimeManifest(repoRoot, 'examples/subapps/alpha-app', {
      ...manifest,
      app_identity: 'alpha-app',
      external_truth_contract_ref: 'alpha-contract'
    });

    const artifact = aggregateRuntimeManifests(repoRoot);
    expect(artifact.manifests).toHaveLength(2);
    expect(artifact.manifests.map((entry) => entry.subappPath)).toEqual([
      'examples/subapps/alpha-app',
      'subapps/zeta-app'
    ]);
    expect(artifact.manifests[0]?.app_identity).toBe('alpha-app');
    expect(artifact.manifests[0]?.external_truth_contract_ref).toBe('alpha-contract');
    expect(artifact.manifests[1]?.app_identity).toBe('example-app');
    expect(artifact.manifests[1]?.provenance.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('materializes a stable runtime-manifests artifact for the same inputs', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-runtime-manifests-'));
    writeRuntimeManifest(repoRoot, 'subapps/proving-ground-app', {
      app_identity: 'proving-ground-app',
      runtime_role: 'consumer',
      runtime_status: 'active',
      signal_groups: ['signals'],
      state_snapshot_types: ['snapshots'],
      bounded_action_families: ['actions'],
      receipt_families: ['receipts'],
      integration_seams: ['seam-a']
    });

    materializeRuntimeManifestsArtifact(repoRoot);
    const first = fs.readFileSync(path.join(repoRoot, '.playbook', 'runtime-manifests.json'), 'utf8');
    materializeRuntimeManifestsArtifact(repoRoot);
    const second = fs.readFileSync(path.join(repoRoot, '.playbook', 'runtime-manifests.json'), 'utf8');
    expect(second).toBe(first);
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });
});
