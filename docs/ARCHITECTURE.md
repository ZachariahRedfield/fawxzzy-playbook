# Playbook Architecture

This document describes **current-state architecture**. Future-state initiatives live in [PLAYBOOK_PRODUCT_ROADMAP.md](./PLAYBOOK_PRODUCT_ROADMAP.md).

## System layering

Playbook is organized as a layered monorepo:

- **`packages/cli`**: command parsing, output rendering, and exit codes.
- **`packages/engine`**: deterministic analysis, verification, plan generation, and fix execution.
- **`packages/node`**: Node/runtime adapter utilities used by CLI and engine integration points.
- **`packages/core`**: shared core contracts/utilities retained for package compatibility.

Primary flow:

`CLI -> engine (+ node adapter) -> repository`

## CLI command architecture

- CLI command handlers live in `packages/cli/src/commands/`.
- `packages/cli/src/commands/index.ts` is the central command registry and dispatch surface.
- Shared CLI helpers live in `packages/cli/src/lib/`.
- Engine behavior and rule execution logic should stay in `packages/engine`, not command files.

This separation keeps command modules thin and keeps governance logic reusable/testable.

## Analyze -> verify -> plan -> apply flow

Playbook governance execution follows a staged flow:

1. **`analyze`** detects repository structure and stack signals.
2. **`verify`** executes deterministic governance rules and returns findings.
3. **`plan`** converts verify failures into ordered, machine-safe tasks.
4. **`apply`** executes deterministic auto-fixable tasks from a generated plan.

`fix` remains available as a convenience command for direct local remediation flows, but the canonical machine-safe execution path is `plan -> apply`.

`plan` and `apply` are the machine-safe planning/execution path for remediation.

## Deterministic task and output contracts

The plan/execution pipeline is deterministic by contract:

- Verify findings are sorted before task generation.
- Task fields are stable (`ruleId`, `file`, `action`, `autoFix`).
- Nullable values are normalized (`file: null` when evidence is absent).
- JSON responses are structured for automation, not best-effort prose parsing.

Deterministic JSON output is treated as a public interface for CI, tooling, and agents.


## Safe Repository Mutation Model

Playbook provides a deterministic mutation engine with built-in safety guarantees for repository changes. Repository content is always treated as untrusted input, and policy enforcement occurs before any mutation is allowed.

Core guardrails in the mutation engine:

- **Repo Root Security Boundary**: all reads and writes must resolve within the repository root.
- **Remediation Plan Validation**: plans are schema-validated and invariant-checked before execution.
- **Evidence-Linked Plans**: each task must map back to deterministic findings and file-level evidence.
- **Secret Redaction in Logs**: execution and diagnostic logs must avoid leaking secrets or sensitive values.
- **CI Artifact Verification**: automation flows verify remediation artifacts and command contracts in CI.
- **Signed Supply Chain Artifacts**: release and security artifacts are signed and verifiable for provenance integrity.

The engine enforces policy gates before `apply`, ensuring that only approved and validated plan tasks can mutate repository state.

## Security Contracts

Playbook encodes runtime safety guarantees as machine-readable security contracts under `docs/contracts/security/`, and verifies those guarantees with deterministic contract tests under `test/contracts/security/`.

This contract layer maps each guarantee to a concrete runtime guard and test expectation so regressions fail fast in CI.

- Pattern: **Security Contracts** — machine-readable definitions of runtime safety guarantees.
- Pattern: **Contract-Driven Security Tests** — CI verifies engine security behavior through contract definitions.
- Rule: **Apply Scope Enforcement** — apply may only modify files declared in the plan.
- Rule: **Repository Boundary** — file operations must resolve within repo root.
- Rule: **Secret Redaction** — sensitive values must never appear in logs.
- Failure Mode: **Boundary Escape** — path traversal or symlink attacks attempting to escape repo root.

## Future Direction: Playbook Agents

Playbook's `verify -> plan -> apply` architecture is intentionally designed to enable safe integration with automated agents over time.

Conceptual control flow:

AI reasoning layer
↓
Playbook query/analysis layer
↓
Playbook remediation planning
↓
policy validation
↓
controlled apply execution

Agents should never write directly to the repository. All mutations must pass through the Playbook remediation pipeline so changes remain deterministic, reviewable, and policy-enforced.

## Rule: Playbook Analyzes but Does Not Author

Playbook provides structured analysis, diagnostics, and recommendations about repository state and development workflows.

Playbook does **not rewrite developer intent or author pull requests automatically**.

Its role is to provide architecture intelligence that informs developers rather than replacing developer judgment.
