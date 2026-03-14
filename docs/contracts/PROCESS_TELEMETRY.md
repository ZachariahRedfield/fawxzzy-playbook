# Process Telemetry Contract (v1)

## Purpose

`process-telemetry.schema.json` defines deterministic execution/process evidence captured at:

- `.playbook/process-telemetry.json`

This artifact records how execution happened so workflow learning can be inspected separately from repository health outcomes.

## Contract shape

Top-level fields:

- `schemaVersion`: fixed schema version (`1.0`)
- `kind`: fixed artifact kind (`process-telemetry`)
- `generatedAt`: generation timestamp (ISO date-time)
- `records`: additive list of process execution records
- `summary`: deterministic rollup computed from `records`

Each `records[]` entry includes:

- `id`
- `recordedAt`
- `task_family`
- `task_duration_ms`
- `files_touched`
- `validators_run`
- `retry_count`
- `merge_conflict_risk`
- `first_pass_success`
- `prompt_size`
- `reasoning_scope`

## Rule

Process telemetry is evidence for process learning, not automatic doctrine.

## Pattern

Keep process execution outcomes separate from repository outcomes so downstream routing can isolate causal drivers.

## Failure mode

Combining process and repository signals into one undifferentiated artifact introduces noisy causality and reduces routing quality.
