# Pattern Portability Contract

`pattern-portability` defines the deterministic cross-repository evidence contract for portable pattern transfer.

- Schema: `packages/contracts/src/pattern-portability.schema.json`
- Generator: `packages/core/src/contracts/patternPortabilityContract.ts`
- External artifact output: `.playbook/cross-repo-patterns.json`

## Required entry fields

Each `patterns[]` entry contains:

- `pattern_id`
- `source_repo`
- `evidence_runs`
- `portability_score`
- `confidence_score`
- `supporting_artifacts`
- `related_subsystems`

## External artifact shape

The generated `.playbook/cross-repo-patterns.json` artifact includes:

- `patterns[]`
- `source_repo`
- `portability_score`
- `evidence_summary`

This preserves explicit evidence packaging for cross-repository portability consumers.
