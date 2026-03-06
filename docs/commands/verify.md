# `playbook verify`

## What it does
Runs deterministic governance rule checks and reports policy findings.

## Common usage
- `playbook verify`
- `playbook verify --ci`
- `playbook verify --json`
- `playbook verify --json --explain`

## Contract notes
- JSON output uses a stable response envelope (`schemaVersion`, `command`, `ok`, `exitCode`).
- Findings are deterministic and sorted for machine consumption.
- Policy failures return exit code `3`.
