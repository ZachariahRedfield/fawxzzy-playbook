# `playbook route`

Classify a task into deterministic local execution, bounded model reasoning, hybrid execution, or unsupported.

## Usage

```bash
pnpm playbook route "summarize current repo state"
pnpm playbook route "propose fix for failing tests"
pnpm playbook route "update command docs" --json
```

## Output contract

Routing always returns:

- selected route
- why selected
- required inputs
- missing prerequisites
- whether repository mutation is allowed
- `executionPlan` (deterministic task-execution plan)

Rule: the model must never decide its own authority boundary; Playbook classifies the task first.

## Deterministic task-family classification

The execution-plan resolver classifies each task into one of:

- `docs_only`
- `contracts_schema`
- `cli_command`
- `engine_scoring`
- `pattern_learning`

Classification is deterministic and keyword/surface driven. If multiple families are detected, routing uses a conservative family selection and emits a warning in `executionPlan.warnings`.

## Execution plan fields

`executionPlan` includes deterministic, task-scoped fields:

- `route_id`
- `task_family`
- `affected_surfaces`
- `estimated_change_surface`
- `rule_packs`
- `required_validations`
- `optional_validations`
- `parallel_lanes` (derived from `parallel_safe`)
- `mutation_allowed` (always `false` in this phase)

## Unsupported/incomplete behavior

If no profile can be resolved from task intent and optional file context, route emits:

- `executionPlan.route_status = "incomplete"`
- `executionPlan.task_family = "unsupported"`
- explicit `executionPlan.missing_prerequisites`

Safety boundary: inspection/proposal only; no autonomous mutation is performed by routing.

Routing rule: prefer conservative correctness over aggressive optimization.
