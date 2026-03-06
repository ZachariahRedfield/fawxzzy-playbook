# `playbook fix`

## What it does
Applies safe, deterministic autofixes for eligible verify findings.

## Common usage
- `playbook fix --dry-run`
- `playbook fix --yes`
- `playbook fix --json --yes`
- `playbook fix --only notes.missing --yes`

## Notable flags
- `--dry-run`: preview changes without writing files.
- `--yes`: apply changes without interactive confirmation.
- `--only <ruleId>`: apply fixes for a specific finding/rule ID.
- `--json` / `--format json`: machine-readable output.
