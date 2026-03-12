# `playbook memory`

`playbook memory` introduces explicit promotion and pruning workflows for semantic memory.

## Why

- **Pattern: Human-Reviewed Knowledge Promotion** — durable memory should be promoted intentionally from reviewed candidates.
- **Rule: Working Memory Is Not Doctrine** — `.playbook/knowledge/candidates.json` is draft working memory, not canonical doctrine.
- **Failure Mode: Memory Hoarding** — unpruned history degrades retrieval quality.
- **Failure Mode: Premature Canonicalization** — promotion should not auto-rewrite governance docs/rules.

## Commands

### Promote

```bash
pnpm playbook memory promote --from-candidate <id> --json
```

Promotes a reviewed candidate from `.playbook/knowledge/candidates.json` into one semantic memory artifact:

- `.playbook/memory/knowledge/decisions.json`
- `.playbook/memory/knowledge/patterns.json`
- `.playbook/memory/knowledge/failure-modes.json`
- `.playbook/memory/knowledge/invariants.json`

Promotion preserves provenance and writes supersession links (`supersedes`, `supersededBy`) when a promoted candidate replaces prior knowledge by fingerprint.

### Prune

```bash
pnpm playbook memory prune --json
```

Pruning performs deterministic cleanup:

- stale candidate expiration
- superseded knowledge removal
- duplicate collapse by fingerprint

## Operating note

Promotion into local semantic memory is intentionally separate from governance/rules/docs mutation. Any committed doctrine changes remain manual and reviewed.
