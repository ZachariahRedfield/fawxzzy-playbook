# Playbook Workspace / Tenant Governance (Read-First v1)

## Purpose

This is the canonical workspace/tenant governance slice for Playbook v1.

It defines a deterministic, read-first governance contract over existing multi-repo control-plane read surfaces and preserves repo-scoped accountability/provenance boundaries.

Rule: Workspace governance may coordinate repos, but must not erase per-repo accountability.

Pattern: repo-scoped truth -> governed interface -> workspace policy view.

Failure Mode: Multi-repo governance that flattens repo boundaries becomes unsafe before it becomes useful.

## v1 scope (explicitly read-only)

- Read-only deterministic artifact: `.playbook/workspace-governance.json`.
- Read-only deterministic interface slice: `workspace-tenant-governance` on the multi-repo control-plane read interface.
- No mutation endpoints.
- No hidden cross-repo orchestration.

## Concepts

### Workspace

A governed collection of repositories coordinated under one deterministic read surface.

### Tenant

An organization-level governance boundary that supplies inherited policy defaults across one or more workspaces.

### Repo membership

Workspace membership is explicit through deterministic `member_repo_ids`.

### Policy inheritance

Policy references are split into:

- `policy_refs.inherited`
- `policy_refs.overridden`

Both are deterministic and inspectable.

### Per-repo accountability

Every member repo keeps an explicit per-repo accountability boundary (`policy_boundary: per-repo`).

### Hosted/self-hosted parity boundary

Hosted and self-hosted layers are packaging choices over the same semantics.

v1 parity invariant:

- `hosted_self_hosted_parity_boundary.semantic_parity = required`
- `hosted_self_hosted_parity_boundary.mutation_authority = none`

## Contract fields (v1)

Workspace governance outputs MUST include:

- `workspace_id`
- `tenant_id`
- `member_repo_ids`
- `policy_refs.inherited`
- `policy_refs.overridden`
- `accountability_boundary`
- `provenance_boundary`

## Determinism and boundaries

Given the same underlying repository/runtime artifacts, the workspace governance output must be identical.

Per-repo policy and provenance boundaries remain explicit and are never flattened into opaque workspace-level truth.

Workspace/tenant views coordinate repository truth; they do not replace it.
