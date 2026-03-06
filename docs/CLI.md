# CLI

## 1) CLI philosophy

Playbook CLI commands are designed for both humans and automation:

- Support readable text output for local developer workflows.
- Support machine-readable JSON output for CI and tooling.
- Keep output deterministic wherever possible (stable ordering and normalized fields).
- Treat JSON output as a public automation contract.

## 2) Command architecture

Playbook keeps command handling and core logic separate:

- `packages/cli`: argument parsing, command dispatch, rendering, and exit behavior.
- `packages/engine`: analysis, verification, planning, and fix execution logic.

Command files should stay thin wrappers around engine functionality so behavior remains reusable and testable.

## 3) JSON output contract

Typical JSON envelope:

```json
{
  "schemaVersion": "1.0",
  "command": "verify",
  "results": []
}
```

Why this contract exists:

- CI compatibility (stable shape for pipelines).
- Reliable integration for AI agents.
- Safer parsing in automation workflows.

## 4) Command pipeline overview

Core Playbook flow:

1. `analyze` → detect repository structure and stack signals.
2. `verify` → detect governance/issues from deterministic rules.
3. `plan` → generate deterministic remediation tasks.
4. Apply stage (`fix`) → execute automated fixes.

## 5) Deterministic behavior

Playbook normalizes and orders machine output to reduce drift across runs:

- Findings are sorted before downstream task generation.
- Stable task fields are preserved for contract consumers.
- Nullable/optional fields are normalized for predictable parsing.
