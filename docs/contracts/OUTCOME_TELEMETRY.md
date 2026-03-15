# Outcome Telemetry Contract (v1)

## Purpose

`outcome-telemetry.schema.json` defines deterministic repository-outcome evidence captured at:

- `.playbook/outcome-telemetry.json`

This artifact records what happened in repository outcomes. It does **not** reinterpret outcomes into doctrine.

## Contract shape

Top-level fields:

- `schemaVersion`: fixed schema version (`1.0`)
- `kind`: fixed artifact kind (`outcome-telemetry`)
- `generatedAt`: generation timestamp (ISO date-time)
- `records`: additive list of repository outcome records
- `summary`: deterministic rollup computed from `records`

Each `records[]` entry includes baseline outcome evidence:

- `id`
- `recordedAt`
- `plan_churn`
- `apply_retries`
- `dependency_drift`
- `contract_breakage`
- `docs_mismatch`
- `ci_failure_categories`

Additive Phase 7 Wave 2A context fields (optional, backward compatible):

- `task_profile_id`: links record to task execution profile lineage.
- `task_family`: links structural outcomes to route/task family.
- `affected_surfaces`: normalized changed surfaces (`docs`, `contracts`, `engine`, etc).
- `estimated_change_surface`: planned structural change-surface estimate.
- `actual_change_surface`: observed structural change-surface after execution.
- `files_changed_count`: observed changed file count.
- `post_apply_verify_passed`: explicit verify result after apply.
- `post_apply_ci_passed`: explicit CI result after apply.
- `regression_categories`: normalized regression taxonomy tags.
- `pattern_families_implicated`: pattern families tied to the outcome.

`summary` now includes additive rollups for the context fields while preserving all original required rollups.

## Rule

Telemetry must preserve task context, not just event counts.

## Pattern

Structural outcome evidence becomes useful when linked to route/task metadata.

## Failure mode

Outcome metrics without task context create false learning signals.
