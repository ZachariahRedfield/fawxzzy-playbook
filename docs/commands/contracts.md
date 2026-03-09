# `playbook contracts`

Emit a deterministic contract registry payload for schema targets, runtime artifacts, and roadmap status.

## Usage

```bash
playbook contracts --json
playbook contracts --json --out .playbook/contracts-registry.json
```

## Flags

- `--json`: print the machine-readable registry contract to stdout.
- `--out <path>`: optionally write the same JSON payload to a file. Defaults to `.playbook/contracts-registry.json`.

## Relationship to other commands

- `playbook schema`: use `playbook schema contracts --json` to validate the `contracts --json` response shape.
- `playbook doctor`: the registry gives downstream automation a deterministic map of expected artifacts.
- Roadmap contract validation: `contracts` includes roadmap availability plus a stable feature status subset when `docs/roadmap/ROADMAP.json` is present.

In consumer repositories where Playbook docs are missing, the command still succeeds and marks doc/roadmap sections as unavailable.
