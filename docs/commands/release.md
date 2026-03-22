# `pnpm playbook release plan`

`pnpm playbook release plan --json --out .playbook/release-plan.json` builds a deterministic release-governance artifact from the current branch/worktree diff plus `.playbook/version-policy.json`.

## What it does

- Detects changed installable package surfaces from repository evidence.
- Resolves lockstep `versionGroups` from `.playbook/version-policy.json`.
- Recommends a conservative semver bump:
  - docs/tests/CI only => `none`
  - shipped internal code => `patch`
  - new command/rule/schema/stable contract/public export => `minor`
  - `major` only when an explicit configured breaking marker is present
- Emits evidence-backed reasons for every file, package, and version group.
- Writes a deterministic plan artifact sorted by path/name.

## Usage

```bash
pnpm playbook release plan --json --out .playbook/release-plan.json
pnpm playbook release plan --base origin/main --json --out .playbook/release-plan.json
```

## Governance notes

- Rule: Version decisions must be artifact-backed, not inferred late during packaging.
- Pattern: Detect -> plan -> apply -> verify is the safe release-governance loop.
- Failure Mode: Catching version drift only at tag/package time turns release into late-stage cleanup.
