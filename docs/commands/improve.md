# `playbook improve`

Generate deterministic improvement candidates from repository memory events and compacted learning pipeline signals.

## Usage

```bash
pnpm playbook improve
pnpm playbook improve --json
pnpm playbook improve apply-safe --json
pnpm playbook improve approve <proposal_id> --json
```

## Subcommands

- `improve` — generate candidates and write deterministic artifacts.
- `improve apply-safe` — apply auto-safe proposals only.
- `improve approve <proposal_id>` — apply explicit human approval for governance-gated candidates.

All improve surfaces support side-effect-free `--help` and deterministic JSON failure envelopes for missing/invalid approval inputs.

## Inputs

- `.playbook/memory/events/*`
- `.playbook/learning-state.json`
- `.playbook/learning-compaction.json` (when available)
- `.playbook/process-telemetry.json` (when available)
- `.playbook/outcome-telemetry.json` (when available)

## Output artifacts

- `.playbook/improvement-candidates.json`
- `.playbook/router-recommendations.json`

## Categories

- `routing`
- `orchestration`
- `worker_prompts`
- `validation_efficiency`
- `ontology`

## Thresholds

Candidates are emitted only when both thresholds are met:

- `minimum_recurrence = 3`
- `minimum_confidence = 0.6`

## Text summary sections

- `AUTO-SAFE improvements`
- `CONVERSATIONAL improvements`
- `GOVERNANCE improvements`
