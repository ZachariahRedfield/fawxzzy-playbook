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

Inspect deterministic cross-repo portability review surfaces.

Views:

- `overview` (default): portability scoring evidence (`source_repo`, `portability_score`, `evidence_runs`, compatible subsystems, risk signals)
- `recommendations`: transfer recommendations (`pattern`, `source_repo`, `target_repo`, `initial_portability_score`, `decision_status`, `evidence_count`)
- `outcomes`: decision/adoption outcomes (`pattern`, `source_repo`, `target_repo`, `initial_portability_score`, `adoption_status`, `observed_outcome`, `sample_size`)
- `recalibration`: confidence updates (`pattern`, `source_repo`, `target_repo`, `initial_portability_score`, `recalibrated_confidence`, `evidence_count`, `sample_size`)
- `transfer-plans`: transfer planning artifact rows from `.playbook/transfer-plans.json` (`pattern`, `source_repo`, `target_repo`, `portability_confidence`, `touched_subsystems`, `required_validations`, `blockers`, `open_questions`)
- `readiness`: target-readiness rows from `.playbook/transfer-readiness.json` (`pattern`, `source_repo`, `target_repo`, `portability_confidence`, `readiness_score`, `touched_subsystems`, `required_validations`, `blockers`, `open_questions`)
- `blocked-transfers`: readiness subset where blockers are present (same field contract as `readiness`)

## Examples

```bash
pnpm playbook knowledge list --json
pnpm playbook knowledge query --type candidate --json
pnpm playbook knowledge inspect <id> --json
pnpm playbook knowledge provenance <id> --json
pnpm playbook knowledge stale --json
pnpm playbook knowledge portability
pnpm playbook knowledge portability --view recommendations
pnpm playbook knowledge portability --view outcomes --json
pnpm playbook knowledge portability --view recalibration --json
pnpm playbook knowledge portability --view transfer-plans --json
pnpm playbook knowledge portability --view readiness --json
pnpm playbook knowledge portability --view blocked-transfers --json
```

## Guarantees

- Read-only command family
- Deterministic normalized record shape
- Provenance-preserving output
