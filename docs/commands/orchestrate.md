# Orchestrate (`pnpm playbook orchestrate`)

`orchestrate` is an **implemented v0 deterministic control-plane command** that compiles one high-level goal into merge-safe lane contracts for parallel Codex plan-mode workflows.

## Control-plane boundary

Playbook orchestration is governance-first:

- Defines lane ownership, dependencies, and shared-file risk.
- Generates deterministic artifacts for workers.
- **Does not** launch workers, create branches, open PRs, merge code, or run autonomous execution loops.

Codex workers are expected to execute lane prompts within the contracts produced by this command.

## Usage

```bash
pnpm playbook orchestrate \
  --goal "Implement query risk and docs audit improvements in parallel" \
  --lanes 3 \
  --out .playbook/orchestrator \
  --format both
```

## Flags

- `--goal <string>` (required)
- `--lanes <number>` (optional, default `3`)
- `--out <dir>` (optional, default `.playbook/orchestrator`)
- `--format <md|json|both>` (optional, default `both`)

Notes:

- `--lanes` must be a positive integer (`>= 1`).
- global `--json` output mode forces artifact format to `json`.

## Deterministic decomposition model (v0)

`orchestrate` currently uses fixed lane categories and deterministic merges:

1. CLI / command surface
2. Engine / domain logic
3. Tests / validation
4. Docs / command-truth integration

If requested lane count is lower than available categories, categories are merged deterministically.
If safe isolation is not possible, lane count is reduced rather than inventing unsafe parallelism. Requested lane counts above 4 are capped to 4 with a warning.

## Output artifacts written today

Default output directory: `.playbook/orchestrator`

- `orchestrator.json` (written when `--format json` or `--format both`)
- `lane-1.prompt.md`, `lane-2.prompt.md`, ... (written when `--format md` or `--format both`)

`orchestrator.json` includes:

- Goal and requested/produced lane counts
- Explicit shared-file conflict hubs
- Warnings for deterministic degradations
- Lane contracts with allowed/forbidden paths, wave/dependency ordering, and prompt file mapping

## Current limitations (v0)

- No runtime execution plane: command does not launch workers, create branches, open PRs, merge code, or run autonomous loops.
- Lane decomposition is template-based with up to four deterministic ownership buckets.
- Lane contracts are generated from static ownership blueprints; this is not a dynamic graph-aware lane compiler yet.
- Prompt artifacts are markdown files only; no native task-execution protocol is emitted.

## Shared-file policy

The following conflict hubs are always surfaced explicitly:

- `README.md`
- `docs/CHANGELOG.md`
- `docs/PLAYBOOK_PRODUCT_ROADMAP.md`

These files are treated as shared-risk surfaces and should be integrated with explicit coordination.

## Worker prompt contract

Each generated lane prompt includes:

- Objective
- Why the lane exists
- Allowed and forbidden files
- Shared-file policy
- Dependency / wave info
- Implementation plan
- Verification steps
- Documentation updates
- Merge notes

This keeps worker execution bounded and lane ownership explicit.

## Future scope (not implemented in this command)

Future-oriented orchestration subcommand concepts such as `orchestrate plan`, `orchestrate explain`, or `orchestrate verify` are not implemented on the current branch.

For live behavior and options, use `pnpm playbook orchestrate --help` and treat this page as the authoritative v0 contract.
