# `pnpm playbook knowledge`

Inspect normalized knowledge artifacts through read-only deterministic surfaces.

Command boundary:
- `pnpm playbook memory ...` is the raw lifecycle/review/mutation surface for memory artifacts.
- `pnpm playbook knowledge ...` is the normalized read-only inspection/query surface.

## Subcommands

### `knowledge list`

List all evidence, candidate, promoted, and superseded knowledge records.

### `knowledge query`

Filter knowledge records with:

- `--type`
- `--status`
- `--module`
- `--rule`
- `--text`
- `--limit`

### `knowledge inspect <id>`

Inspect one knowledge record by id.

### `knowledge timeline`

Show the knowledge timeline in deterministic order.

### `knowledge provenance <id>`

Resolve direct evidence and related-record lineage for one knowledge record.

### `knowledge stale`

List stale candidates plus retired and superseded promoted knowledge.

### `knowledge portability`

Inspect deterministic cross-repo pattern portability scoring evidence, including:

- `source_repo`
- `portability_score`
- `evidence_runs`
- `compatible_subsystems`
- `risk_signals`

## Examples

```bash
pnpm playbook knowledge list --json
pnpm playbook knowledge query --type candidate --json
pnpm playbook knowledge inspect <id> --json
pnpm playbook knowledge provenance <id> --json
pnpm playbook knowledge stale --json
pnpm playbook knowledge portability
pnpm playbook knowledge portability --json
```

## Guarantees

- Read-only command family
- Deterministic normalized record shape
- Provenance-preserving output
