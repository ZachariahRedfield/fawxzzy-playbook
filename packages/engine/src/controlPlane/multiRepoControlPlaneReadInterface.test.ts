import { describe, expect, it } from 'vitest';
import { buildMultiRepoReadInterfaceEnvelope } from './multiRepoControlPlaneReadInterface.js';

describe('buildMultiRepoReadInterfaceEnvelope', () => {
  it('builds deterministic read-only envelopes with explicit repo boundaries', () => {
    const first = buildMultiRepoReadInterfaceEnvelope({
      slice: 'run-state-inspection',
      repoScope: [
        { repo_id: 'repo-b', repo_root: '/tmp/repo-b' },
        { repo_id: 'repo-a', repo_root: '/tmp/repo-a' },
      ],
      provenance: ['.playbook/control-plane.json', '.playbook/execution-runs/*.json', '.playbook/control-plane.json'],
      payload: { run_state: [] },
    });

    const second = buildMultiRepoReadInterfaceEnvelope({
      slice: 'run-state-inspection',
      repoScope: [
        { repo_id: 'repo-b', repo_root: '/tmp/repo-b' },
        { repo_id: 'repo-a', repo_root: '/tmp/repo-a' },
      ],
      provenance: ['.playbook/control-plane.json', '.playbook/execution-runs/*.json'],
      payload: { run_state: [] },
    });

    expect(first).toEqual(second);
    expect(first.request.mode).toBe('read-only');
    expect(first.response.policy_boundary.mutation_authority).toBe('none');
    expect(first.response.repo_scope.map((entry) => entry.repo_id)).toEqual(['repo-a', 'repo-b']);
    expect(first.response.repo_scope.every((entry) => entry.policy_boundary === 'per-repo')).toBe(true);
    expect(first.response.provenance).toEqual([
      '.playbook/control-plane.json',
      '.playbook/execution-runs/*.json',
    ]);
  });
});
