# telemetry

Inspect deterministic telemetry artifacts and learning summaries.

## Subcommands

- `playbook telemetry outcomes`
- `playbook telemetry process`
- `playbook telemetry learning-state`
- `playbook telemetry learning`
- `playbook telemetry summary`
- `playbook telemetry cycle [--detect-regressions]`
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


## `telemetry cycle`

`playbook telemetry cycle` summarizes governed cycle runtime evidence by reading:

- `.playbook/cycle-history.json` (required evidence source for history-based metrics)
- `.playbook/cycle-state.json` (optional latest-cycle snapshot)

This command is evidence-only: it does **not** recompute cycle orchestration state and does not modify runtime behavior.

### Summary metrics

- total/success/failed cycle counts
- success rate
- average cycle duration
- most common failed step
- deterministic failure distribution by `failed_step`
- recent cycle entries (newest first)
- optional `latest_cycle_state` summary when cycle-state exists (including state-only repos where history is absent)
- deterministic regression detection summary derived from history windows (`recent_summary` vs `prior_summary`)

### JSON mode

JSON mode emits a deterministic, parseable payload with at least:

- `cycles_total`
- `cycles_success`
- `cycles_failed`
- `success_rate`
- `average_duration_ms`
- `most_common_failed_step`
- `recent_cycles`

Additional stable fields include `failure_distribution`, optional `latest_cycle_state`, and regression fields:

- `regression_detected`
- `regression_reasons[]`
- `comparison_window`
- `recent_summary`
- `prior_summary`

Use `--detect-regressions` in text mode to print concise warning/open-question wording from the same governed artifact evidence. Sparse history degrades safely with explicit insufficient-history messaging.

