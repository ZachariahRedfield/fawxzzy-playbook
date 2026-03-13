# Playbook Knowledge Query Surfaces

## Purpose

Phase 14 adds deterministic, read-only inspection surfaces for Playbook knowledge artifacts.

These surfaces exist for:

- debugging internal knowledge state
- CI auditing
- governance review
- future automation synthesis prerequisites

Rule: the inspection layer is read-only.

Mutation, promotion, retirement, and pruning remain outside this command family.

## Knowledge lifecycle

The inspection model exposes the lifecycle as auditable states:

`evidence -> candidate -> promoted -> superseded`

- `evidence` comes from episodic memory events under `.playbook/memory/events/*.json`
- `candidate` comes from replayed knowledge candidates in `.playbook/memory/candidates.json`
- `promoted` comes from active or retired promoted knowledge artifacts under `.playbook/memory/knowledge/*.json`
- `superseded` comes from promoted knowledge records that have been replaced by newer doctrine

Each state remains queryable through the same `playbook knowledge` namespace.

## Canonical artifact shape

Knowledge inspection records normalize disparate storage artifacts into one read model with these required fields:

- `id`
- `type`
- `createdAt`
- `repo`
- `source`
- `confidence`
- `status`
- `provenance`
- `metadata`

Artifact types:

- `evidence`
- `candidate`
- `promoted`
- `superseded`

Status values currently exposed:

- `observed`
- `active`
- `stale`
- `retired`
- `superseded`

## CLI surface

The read-only namespace is:

```bash
pnpm playbook knowledge list --json
pnpm playbook knowledge query --type candidate --json
pnpm playbook knowledge inspect <id> --json
pnpm playbook knowledge timeline --json
pnpm playbook knowledge provenance <id> --json
pnpm playbook knowledge stale --json
```

Subcommand intent:

- `list`: enumerate all normalized knowledge records
- `query`: filter by type, status, module, rule, text, or limit
- `inspect`: show one record by id
- `timeline`: show records ordered chronologically
- `provenance`: resolve direct evidence and related record lineage for one record
- `stale`: show stale candidates plus retired/superseded knowledge

## JSON schemas

The canonical CLI schema for this surface is available in two places:

- `pnpm playbook schema knowledge --json`
- `packages/contracts/src/knowledge.schema.json`

Contract shape coverage includes:

- `knowledge-list`
- `knowledge-query`
- `knowledge-inspect`
- `knowledge-timeline`
- `knowledge-provenance`
- `knowledge-stale`

## Guardrails

- Rule: provenance is required on every knowledge inspection record
- Rule: inspection commands must not mutate `.playbook/memory/**`
- Pattern: queryable knowledge before automated knowledge consumption
- Failure Mode: hidden mutation inside a read-runtime command
