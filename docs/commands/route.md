# `playbook route`

Classify a task into deterministic local execution, bounded model reasoning, hybrid execution, or unsupported.

## Usage

```bash
pnpm playbook route "summarize current repo state"
pnpm playbook route "propose fix for failing tests"
pnpm playbook route "apply approved remediation plan"
```

## Output contract

Routing always returns:

- selected route
- why selected
- required inputs
- missing prerequisites
- whether repository mutation is allowed

Rule: the model must never decide its own authority boundary; Playbook classifies the task first.

## Execution router overview

The execution router now emits a deterministic task execution profile proposal as a first step toward process self-improvement.

- Inputs considered: changed files, task family, affected packages, and command/docs/contracts surfaces.
- Output: smallest sufficient rule packs plus required/optional validation bundles, with `proposalOnly: true`.
- Safety boundary: inspection/proposal only; no autonomous mutation is performed by routing.

Routing rule: prefer the smallest sufficient rule system for governance, not merely the smallest possible one.
