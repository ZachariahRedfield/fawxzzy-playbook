# Task Execution Profile Contract (v1)

## Purpose

`task-execution-profile.schema.json` defines a deterministic, read-only proposal artifact for task routing.

Artifact path:

- `.playbook/task-execution-profile.json`

Execution profiles describe the **smallest sufficient rule system** for a task family. They are governance-aware routing proposals, not automatic mutations.

## Smallest sufficient rule system semantics

A task execution profile should minimize activation scope while preserving required governance guarantees.

Each task family proposal records the minimum:

- scope needed to complete the task safely
- affected surfaces that must be considered during planning
- rule packs required to avoid governance drift
- required and optional validations
- docs requirements to preserve contract and policy alignment

This keeps deterministic task routing bounded and reduces unnecessary runtime reasoning.

## Contract shape

Top-level fields:

- `schemaVersion`: fixed schema version (`1.0`)
- `kind`: fixed artifact kind (`task-execution-profile`)
- `generatedAt`: deterministic ISO date-time timestamp
- `proposalOnly`: fixed `true` guardrail marking first-phase read-only intent
- `profiles`: deterministic list of task-family routing proposals

Each `profiles[]` entry contains:

- `task_family`: task category identifier
- `scope`: bounded change scope (`single-file`, `single-module`, `multi-module`, `cross-repo`)
- `affected_surfaces`: bounded affected system surfaces
- `rule_packs`: minimum rule set required to preserve governance
- `required_validations`: validations that must run for safe execution
- `optional_validations`: extra validations for increased confidence
- `docs_requirements`: docs surfaces that must remain aligned
- `parallel_safe`: whether execution is safe to parallelize
- `estimated_change_surface`: bounded impact estimate (`small`, `medium`, `large`)

## Determinism and governance

- Profiles should be emitted in deterministic `task_family` order.
- `required_validations` must preserve baseline governance for the declared scope.
- `optional_validations` must never replace required validations.
- `proposalOnly` must remain `true` for this phase.

## Rule

Execution profiles must minimize scope without dropping required governance.

## Pattern

Bounded task routing reduces runtime by minimizing unnecessary reasoning and validation surfaces.

## Failure mode

Over-minimized execution profiles create false speedups by skipping necessary validation and docs updates.
