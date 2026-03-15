# `playbook improve`

Generate deterministic improvement candidates from repository memory events and learning-state signals.

## Usage

```bash
pnpm playbook improve
pnpm playbook improve --json
```

## Inputs

- `.playbook/memory/events/*`
- `.playbook/learning-state.json`

## Output artifact

- `.playbook/improvement-candidates.json`

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
