# Playbook Multi-Repo Control Plane Interfaces (Read-First Slice)

## Purpose

This document defines the first governed interface/API slice for multi-repo control planes as a **read-first contract** over existing deterministic runtime surfaces.

This slice is additive and does not alter engine authority boundaries.

## Docs summary labels

- Rule: Multi-repo control-plane interfaces must preserve per-repo policy and provenance boundaries.
- Pattern: Existing deterministic runtime -> governed read interface -> coordinated control-plane visibility.
- Failure Mode: Cross-repo interfaces that flatten policy/provenance boundaries become unsafe before they become useful.

## Scope for this first slice (read-only)

The first governed interface slice is limited to read surfaces:

1. readiness / proof
2. run-state inspection
3. longitudinal state summary
4. cross-repo pattern comparison / portability / proposals

No mutation endpoint is introduced in this slice.

## Canonical transport surface

The canonical operator-facing surface is the existing Observer API.

- Endpoint: `/api/control-plane/interfaces/read`
- Query: `slice=<readiness-proof|run-state-inspection|longitudinal-state-summary|cross-repo-pattern-comparison>`
- Output contract kind: `playbook-multi-repo-control-plane-read-interface`
- Mode: `read-only`

## Contract envelope

Each response uses one deterministic envelope with explicit boundaries:

- request
  - `slice`
  - `mode` (fixed `read-only`)
  - `target_repo_ids`
- response
  - `deterministic`
  - `generated_at` (deterministic timestamp)
  - `policy_boundary`
    - `mutation_authority: none`
    - `hidden_cross_repo_orchestration: false`
  - `repo_scope[]`
    - `repo_id`
    - `repo_root`
    - `policy_boundary: per-repo`
    - `provenance_boundary: per-repo`
  - `provenance[]`
  - `slice_payload`

## Artifact truth and provenance sources

This interface only re-exposes canonical deterministic artifacts:

- readiness / proof: session, policy, and execution-readiness artifacts
- run-state inspection: control-plane state + execution run-state + evidence envelope
- longitudinal summary: longitudinal-state + remediation/runtime history artifacts
- cross-repo pattern comparison: cross-repo pattern artifact + proposals/candidates

The interface does not add alternate truth stores.

## Boundary guarantees

- Per-repo policy remains explicit in `repo_scope`.
- Per-repo provenance remains explicit in `repo_scope` + `provenance`.
- No hidden cross-repo orchestration authority is introduced.
- Response contracts remain deterministic and auditable.

## Machine-readable schema

Schema path:

- `packages/contracts/src/multi-repo-control-plane-read-interface.schema.json`

This schema governs the request/response envelope and the mandatory provenance/policy boundary metadata.

## Relationship to adjacent docs

- `docs/architecture/PLAYBOOK_GOVERNED_INTERFACE_API_SURFACES_FOR_MULTI_REPO_CONTROL_PLANES.md`
- `docs/architecture/PLAYBOOK_CONTROL_PLANE_ARCHITECTURE.md`
- `docs/architecture/PLAYBOOK_REPO_LONGITUDINAL_STATE_AND_KNOWLEDGE_PROMOTION.md`
- `docs/architecture/PLAYBOOK_GOVERNED_CROSS_REPO_PATTERN_PROMOTION_AND_TRANSFER.md`
