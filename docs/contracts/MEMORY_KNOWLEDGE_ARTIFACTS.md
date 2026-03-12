# Memory Knowledge Artifacts Contract

## Scope

These artifacts are local semantic-memory outputs populated through explicit review commands:

- `.playbook/memory/knowledge/decisions.json`
- `.playbook/memory/knowledge/patterns.json`
- `.playbook/memory/knowledge/failure-modes.json`
- `.playbook/memory/knowledge/invariants.json`

Candidate input artifact:

- `.playbook/knowledge/candidates.json`

## Shape (v1)

Each promoted artifact stores:

- `schemaVersion: "1.0"`
- `kind: "playbook-promoted-knowledge"`
- `knowledgeKind`
- `updatedAt`
- `items[]`

Each item stores:

- `id`
- `fingerprint`
- `theme`
- `supersedes[]`
- `supersededBy[]`
- `provenance`:
  - `promotedFromCandidateId`
  - `promotedAt`
  - `sourceArtifactPath`
  - `evidence[]`

## Invariants

- **Rule: Retrieval Must Return Provenance** — promoted knowledge must preserve a source candidate and evidence pointers.
- **Rule: Working Memory Is Not Doctrine** — candidate artifacts are draft memory until explicit promotion.
- Supersession is explicit and directional (`supersedes` / `supersededBy`).
- Pruning may remove superseded and duplicate items, but must not erase provenance from retained items.
