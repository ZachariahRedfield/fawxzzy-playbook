# Testing Guidelines

Playbook treats tests as a product feature. As commands/rules are added, coverage must expand with them.

## Command-level expectations

Each new CLI command should add:

- command-local CLI tests (`packages/cli/src/commands/<command>.test.ts`)
- engine-level tests for underlying deterministic logic (if engine behavior is introduced)
- JSON contract tests for `--json` output shape/stability
- integration/smoke coverage when behavior spans command + engine + filesystem

## Unit tests

Command tests should validate:

- success and failure behavior
- exit code behavior
- deterministic JSON output fields and envelope shape

## Integration coverage

When command flows span the engine, include integration paths such as:

- `verify` -> rule execution
- `plan` -> verify findings to task mapping
- `fix` -> fix handler execution

## Smoke test philosophy

Smoke tests validate **built/packed/installed behavior**, not only in-repo execution.

`scripts/smoke-test.mjs` should verify key commands and JSON contract shapes end-to-end, including expected fields like `schemaVersion`, `command`, `ok`, and command-specific payloads.

## CI enforcement

CI enforces test-presence policy with `scripts/check-tests.mjs`.

The check fails when a newly added CLI command file or verify-rule file is missing a corresponding test file.

## Verify rule

`verify.rule.tests.required` is a core verify rule that fails verification when changed command/rule files do not include required test coverage.
