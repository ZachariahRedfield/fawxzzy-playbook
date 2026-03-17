# `playbook observer`

Manage a deterministic local observer registry and thin local read-only API server.

## Usage

```bash
pnpm playbook observer repo add <path>
pnpm playbook observer repo list --json
pnpm playbook observer repo remove <id>
pnpm playbook observer serve --port 4300
```

## Registry artifact

The repo registry command maintains:

- `.playbook/observer/repos.json`

Contract:

- `schemaVersion: "1.0"`
- `kind: "repo-registry"`
- `repos[]` entries include stable `id`, `name`, absolute `root`, `status`, `artifactsRoot`, and deterministic `tags`.

## Local server (`observer serve`)

`pnpm playbook observer serve` starts a local-only read-only HTTP server bound to `127.0.0.1` by default.

- No mutation routes are provided in v1.
- Only `GET` routes are allowed.
- Responses are deterministic JSON envelopes.
- Data is read from governed observer artifacts and repo-local `.playbook` artifacts.

Endpoints:

- `GET /health`
- `GET /repos`
- `GET /snapshot`
- `GET /repos/:id`
- `GET /repos/:id/artifacts/:kind`

Supported `:kind` values:

- `cycle-state`
- `cycle-history`
- `policy-evaluation`
- `policy-apply-result`
- `pr-review`
- `session`

## Determinism and scope

- Deterministic ordering is enforced by `id`.
- Duplicate `id` and duplicate `root` values are rejected.
- This is a local/private-first observer index and local wrapper API only.
- Canonical runtime artifacts remain per repository under each repo's `.playbook/` root.

Rule: A Playbook server must wrap governed artifacts and commands, not replace them.
Pattern: Thin local server over canonical runtime artifacts.
Failure Mode: If the server becomes the real source of state instead of a wrapper over repo-local truth, architecture drifts away from CLI-first determinism.
