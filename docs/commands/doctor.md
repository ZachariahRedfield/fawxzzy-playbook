# `playbook doctor`

## What it does
Checks local Playbook prerequisites and documentation/config health. Can also preview/apply safe deterministic fixes.

## Common usage
- `playbook doctor`
- `playbook doctor --fix --dry-run`
- `playbook doctor --fix --yes`
- `playbook doctor --json`

## Notable flags
- `--fix`: enable doctor fix planning/apply mode.
- `--dry-run`: preview fixes without writing changes.
- `--yes`: apply eligible safe fixes.
- `--json` / `--format json`: machine-readable output.
