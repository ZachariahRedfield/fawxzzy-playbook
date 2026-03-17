# `pnpm playbook review-pr`

Run a governed, read-only pull-request review loop by composing existing Playbook primitives:

1. `analyze-pr`
2. `improve`
3. `policy evaluate`

No new analysis logic is introduced.

## Usage

```bash
pnpm playbook review-pr
pnpm playbook review-pr --json
pnpm playbook review-pr --format github-comment
pnpm playbook review-pr --base main --json
```

## Output contract

`--json` emits:

```json
{
  "schemaVersion": "1.0",
  "kind": "pr-review",
  "findings": [],
  "proposals": [],
  "policy": {
    "safe": [],
    "requires_review": [],
    "blocked": []
  },
  "summary": {
    "findings": 0,
    "proposals": 0,
    "safe": 0,
    "requires_review": 0,
    "blocked": 0
  }
}
```

Text output is concise and summary-oriented.

Every `review-pr` run also persists the same governed payload to `.playbook/pr-review.json` for auditability and downstream control-plane reuse.

## Read-only behavior

- `review-pr` never applies remediation.
- `review-pr` never mutates repository source files.
- `review-pr` runs deterministic proposal and policy surfaces only.

## Governance note

Rule: PR review must be composed from existing governed primitives, not new inference paths.

## Explain integration

```bash
pnpm playbook explain artifact .playbook/pr-review.json
```

The explain surface summarizes findings, proposals, and policy breakdown from the persisted artifact.
