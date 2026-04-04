const uniqueSorted = (values: string[]): string[] =>
  [...new Set(values.map((entry) => entry.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );

export const WORKSPACE_GOVERNANCE_RELATIVE_PATH = '.playbook/workspace-governance.json' as const;

export type WorkspaceGovernanceArtifact = {
  schemaVersion: '1.0';
  kind: 'playbook-workspace-governance';
  read_only: true;
  deterministic: true;
  workspace_id: string;
  tenant_id: string;
  member_repo_ids: string[];
  policy_refs: {
    inherited: string[];
    overridden: string[];
  };
  accountability_boundary: {
    rule: 'workspace-coordinates-repos-without-erasing-repo-accountability';
    per_repo: Array<{
      repo_id: string;
      policy_boundary: 'per-repo';
      accountability: 'explicit';
    }>;
  };
  provenance_boundary: {
    rule: 'repo-scoped-truth-to-governed-interface-to-workspace-policy-view';
    per_repo: Array<{
      repo_id: string;
      boundary: 'per-repo';
      sources: string[];
    }>;
  };
  hosted_self_hosted_parity_boundary: {
    semantic_parity: 'required';
    mutation_authority: 'none';
  };
};

type BuildWorkspaceGovernanceArtifactInput = {
  workspace_id: string;
  tenant_id: string;
  member_repo_ids: string[];
  inherited_policy_refs: string[];
  overridden_policy_refs: string[];
  per_repo_provenance_sources: Array<{ repo_id: string; sources: string[] }>;
};

export const buildWorkspaceGovernanceArtifact = (
  input: BuildWorkspaceGovernanceArtifactInput,
): WorkspaceGovernanceArtifact => {
  const memberRepoIds = uniqueSorted(input.member_repo_ids);
  const inherited = uniqueSorted(input.inherited_policy_refs);
  const overridden = uniqueSorted(input.overridden_policy_refs);

  return {
    schemaVersion: '1.0',
    kind: 'playbook-workspace-governance',
    read_only: true,
    deterministic: true,
    workspace_id: input.workspace_id.trim(),
    tenant_id: input.tenant_id.trim(),
    member_repo_ids: memberRepoIds,
    policy_refs: {
      inherited,
      overridden,
    },
    accountability_boundary: {
      rule: 'workspace-coordinates-repos-without-erasing-repo-accountability',
      per_repo: memberRepoIds.map((repoId) => ({
        repo_id: repoId,
        policy_boundary: 'per-repo' as const,
        accountability: 'explicit' as const,
      })),
    },
    provenance_boundary: {
      rule: 'repo-scoped-truth-to-governed-interface-to-workspace-policy-view',
      per_repo: memberRepoIds.map((repoId) => {
        const entry = input.per_repo_provenance_sources.find((candidate) => candidate.repo_id === repoId);
        return {
          repo_id: repoId,
          boundary: 'per-repo' as const,
          sources: uniqueSorted(entry?.sources ?? []),
        };
      }),
    },
    hosted_self_hosted_parity_boundary: {
      semantic_parity: 'required',
      mutation_authority: 'none',
    },
  };
};
