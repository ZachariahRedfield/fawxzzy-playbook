# `playbook plan`

## What it does
Generates a deterministic remediation task list from verify failures.

## Common usage
- `playbook plan`
- `playbook plan --ci`
- `playbook plan --json`

## Contract notes
- JSON output includes `schemaVersion`, `command`, `verify`, and `tasks`.
- Task objects use stable fields: `ruleId`, `file`, `action`, `autoFix`.
- Findings are sorted before task generation to keep task order deterministic.
