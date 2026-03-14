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

Each `records[]` entry includes:

- `id`
- `recordedAt`
- `plan_churn`
- `apply_retries`
- `dependency_drift`
- `contract_breakage`
- `docs_mismatch`
- `ci_failure_categories`

## Rule

Telemetry artifacts must capture what happened, not reinterpret it as guidance.

## Pattern

Separating repository outcomes from process outcomes preserves analyzability for architecture learning.

## Failure mode

Mixing process signals with repository health signals in one artifact weakens causal reasoning and future routing decisions.
