import { describe, expect, it } from 'vitest';
import { buildWorkspaceGovernanceArtifact } from './workspaceGovernance.js';

describe('buildWorkspaceGovernanceArtifact', () => {
  it('builds deterministic read-only workspace governance with explicit per-repo boundaries', () => {
    const first = buildWorkspaceGovernanceArtifact({
      workspace_id: 'workspace:demo',
      tenant_id: 'tenant:demo',
      member_repo_ids: ['repo-b', 'repo-a', 'repo-a'],
      inherited_policy_refs: ['policy:tenant/defaults', 'policy:workspace/baseline'],
      overridden_policy_refs: ['policy:repo/repo-b/override', 'policy:repo/repo-a/override'],
      per_repo_provenance_sources: [
        { repo_id: 'repo-b', sources: ['.playbook/policy-evaluation.json', '.playbook/session.json'] },
        { repo_id: 'repo-a', sources: ['.playbook/session.json', '.playbook/policy-evaluation.json'] },
      ],
    });

    const second = buildWorkspaceGovernanceArtifact({
      workspace_id: 'workspace:demo',
      tenant_id: 'tenant:demo',
      member_repo_ids: ['repo-a', 'repo-b'],
      inherited_policy_refs: ['policy:workspace/baseline', 'policy:tenant/defaults'],
      overridden_policy_refs: ['policy:repo/repo-a/override', 'policy:repo/repo-b/override'],
      per_repo_provenance_sources: [
        { repo_id: 'repo-a', sources: ['.playbook/policy-evaluation.json', '.playbook/session.json'] },
        { repo_id: 'repo-b', sources: ['.playbook/session.json', '.playbook/policy-evaluation.json'] },
      ],
    });

    expect(first).toEqual(second);
    expect(first.read_only).toBe(true);
    expect(first.deterministic).toBe(true);
    expect(first.member_repo_ids).toEqual(['repo-a', 'repo-b']);
    expect(first.policy_refs.inherited).toEqual([
      'policy:tenant/defaults',
      'policy:workspace/baseline',
    ]);
    expect(first.policy_refs.overridden).toEqual([
      'policy:repo/repo-a/override',
      'policy:repo/repo-b/override',
    ]);
    expect(first.accountability_boundary.per_repo.every((entry) => entry.policy_boundary === 'per-repo')).toBe(true);
    expect(first.provenance_boundary.per_repo.every((entry) => entry.boundary === 'per-repo')).toBe(true);
    expect(first.hosted_self_hosted_parity_boundary.mutation_authority).toBe('none');
  });
});
