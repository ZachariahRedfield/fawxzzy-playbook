# `playbook ask`

Answer repository questions using machine-readable repository intelligence.

## Usage

- `playbook ask "where should a new feature live?"`
- `playbook ask "what architecture does this repo use?"`
- `playbook ask "what modules exist?"`
- `playbook ask "where should a new feature live?" --json`
- `playbook ask "what modules are affected by this change?" --diff-context`
- `playbook ask "what should I verify before merge?" --diff-context --mode concise`
- `playbook ask "summarize the architectural risk of this diff" --diff-context --json`

## Behavior

`playbook ask` is intentionally thin at the CLI layer. It delegates reasoning to engine rules that:

1. Normalize your question.
2. Query repository intelligence via `playbook query` internals.
3. Produce deterministic answers from architecture/module/framework/rule-registry signals.

`playbook ask` reads intelligence from `.playbook/repo-index.json` through the query engine and does **not** scan your repository directly.

`--diff-context` narrows reasoning to the active change set by combining git diff file discovery with indexed Playbook module intelligence. It fails deterministically when index/diff inputs are missing and does not silently broaden to full-repo inference.

## Example text output

```text
Recommended location: src/features/<feature>

Reason
Playbook detected modular-monolith architecture with feature boundaries under src/features.
```

## JSON output contract

```json
{
  "command": "ask",
  "question": "where should a new feature live?",
  "answer": "Recommended location: src/features/<feature>",
  "reason": "Playbook detected modular-monolith architecture with feature boundaries under src/features.",
  "context": {
    "architecture": "modular-monolith",
    "framework": "nextjs",
    "modules": ["users", "workouts"]
  }
}
```

## Notes

- Deterministic answers are returned when AI is disabled.
- Future AI integrations can enrich responses while preserving this baseline contract.
