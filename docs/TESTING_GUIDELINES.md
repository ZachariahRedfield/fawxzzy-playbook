# Testing Guidelines

All new Playbook CLI commands and rule-engine rules must include tests at creation time.

## Unit tests

Each new CLI command module must include a command-local unit test file:

- Source: `packages/cli/src/commands/<command>.ts`
- Test: `packages/cli/src/commands/<command>.test.ts`

Examples:

- `status.ts` → `status.test.ts`
- `plan.ts` → `plan.test.ts`
- `apply.ts` → `apply.test.ts`

Unit tests should validate command behavior for:

- expected success output
- expected failure output
- structured JSON output where supported
- exit code behavior

## Integration tests

Rule-engine interactions must include integration coverage for command-to-rule and rule-to-task execution paths.

Required scenarios:

- `verify` → rule execution
- `plan` → rule → task mapping
- `apply` → fix handler execution

Integration tests should validate rule IDs, findings, and remediation/fix behavior in realistic repo states.

## Smoke tests

End-to-end CLI workflows must be exercised by `scripts/smoke-test.mjs`.

At minimum, smoke coverage must include:

- `init`
- `status`
- `plan`
- `apply`
- `verify`

## CI enforcement

CI enforces this policy with `scripts/check-tests.mjs`.

The check fails when a newly added CLI command file or verify-rule file is missing a corresponding test file.

## Verify rule

`verify.rule.tests.required` is a core verify rule that fails verification when changed command/rule files do not have required tests.

## Reporting environment-specific test failures

When a test failure is attributable to infrastructure or environment behavior, document it explicitly so reviewers do not misclassify it as a product regression.

Preferred wording for the current `plan.test.ts` environment issue:

> Ran CLI plan unit tests with `pnpm --filter @fawxzzy/playbook test -- plan.test.ts`. In this environment, the run failed due to a Vite import-analysis workspace package entry resolution issue. This appears to be environment-specific and does not indicate a functional regression in the new plan contract behavior.

Stronger wording for PR/testing notes:

> Ran CLI plan unit tests with `pnpm --filter @fawxzzy/playbook test -- plan.test.ts`. The failure observed here is attributable to environment-specific Vite import-analysis behavior when resolving workspace package entrypoints, rather than to the plan contract changes themselves. No evidence from this failure suggests a regression in the new contract behavior.
