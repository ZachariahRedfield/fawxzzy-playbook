# telemetry

Inspect deterministic telemetry artifacts and learning summaries.

## Subcommands

- `playbook telemetry outcomes`
- `playbook telemetry process`
- `playbook telemetry learning-state`
- `playbook telemetry learning`
- `playbook telemetry summary`
- `playbook telemetry commands`

## `telemetry commands`

`playbook telemetry commands` reads `.playbook/telemetry/command-quality.json` and emits deterministic summaries for:

- `verify`
- `route`
- `orchestrate`
- `execute`
- `telemetry`
- `improve`

### Text mode

Text mode reports one row per command with:

- command name
- total run count
- success rate
- average duration (ms)
- average confidence
- warning/open-question rates

### JSON mode

JSON mode emits a stable parseable artifact:

- `kind: "command-quality-summary"`
- `sourceArtifact: ".playbook/telemetry/command-quality.json"`
- `commands: CommandQualitySummaryRow[]`
