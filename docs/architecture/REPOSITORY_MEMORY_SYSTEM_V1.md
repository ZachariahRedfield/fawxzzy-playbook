# Repository Memory System V1 (Future State Specification)

## Purpose

Define a future-state repository memory system that separates short-lived execution context from reviewed durable knowledge so Playbook-enabled workflows can retain useful history without compromising deterministic governance.

This specification describes the intended operating model, artifact boundaries, and promotion controls for memory within this repository.

## Scope

This document covers:

- Memory categories and their intended roles.
- Artifact placement under `.playbook/`.
- Promotion rules from ephemeral context to durable memory.
- Provenance and traceability requirements for memory artifacts.
- Integration boundaries with doctrine, rules, contracts, and docs surfaces.

This document does not define implementation details for storage engines, APIs, or transport protocols.

## Memory taxonomy

### Working memory (ephemeral)

Short-lived, task-local context used during active execution.

- Typical contents: transient reasoning scaffolds, active task state, temporary summaries.
- Lifecycle: created and consumed within a session; not authoritative by default.
- Durability: low; should be pruned aggressively.

### Episodic memory (event history)

Time-ordered records of notable repository and workflow events.

- Typical contents: verification runs, planning/apply outcomes, command invocations, decision events.
- Lifecycle: append-oriented event log with retention policy.
- Durability: medium-to-high, depending on governance retention settings.

### Semantic memory (knowledge)

Curated, reusable knowledge abstractions derived from multiple episodes.

- Typical contents: reusable insights, stable mappings, distilled repository facts, validated heuristics.
- Lifecycle: promoted only after explicit review.
- Durability: high; intended for reuse across sessions.

### Doctrine / procedural memory (normative guidance)

Reviewed, policy-level guidance that governs behavior.

- Typical contents: canonical rules, operating contracts, approved procedural patterns, authoritative docs.
- Lifecycle: human-reviewed and versioned through standard repository governance.
- Durability: highest; treated as normative source material.

## Artifact layout under `.playbook/` (future state)

### `.playbook/context/*`

Ephemeral working-memory surfaces for current or recent execution windows.

Concrete examples:

- `.playbook/context/session-current.json`
- `.playbook/context/task-queue.snapshot.json`
- `.playbook/context/agent-bootstrap.cache.json`

Expected properties:

- Session-scoped or short-retention.
- Replaceable/regenerable.
- Not directly treated as durable knowledge.

### `.playbook/memory/events/*`

Episodic event streams and normalized event envelopes.

Concrete examples:

- `.playbook/memory/events/2026-01-15.verify-run.ndjson`
- `.playbook/memory/events/2026-01-15.plan-apply-cycle.ndjson`
- `.playbook/memory/events/command-invocations/2026-W03.jsonl`

Expected properties:

- Append-oriented.
- Timestamped and actor-attributed.
- Suitable as provenance input for later knowledge promotion.

### `.playbook/memory/knowledge/*`

Reviewed durable semantic memory artifacts.

Concrete examples:

- `.playbook/memory/knowledge/patterns/repo-bootstrap-order.v1.json`
- `.playbook/memory/knowledge/modules/ownership-map.v2.json`
- `.playbook/memory/knowledge/lessons/rule-remediation-sequences.v1.md`

Expected properties:

- Promotion-gated.
- Versioned.
- Backed by provenance references to events and source docs.

### Doctrine / rules / contracts / docs surfaces

Normative and procedural memory remains in governed repository surfaces (not only under `.playbook/memory/knowledge`).

Concrete examples:

- Doctrine: `AGENTS.md`.
- Rules: rule definitions and governance rule sources used by `verify`.
- Contracts: machine-readable contracts such as `.playbook/ai-contract.json` and related schemas.
- Docs: repository documentation surfaces (for example, command references and architecture docs).

Expected properties:

- Human-reviewed and PR-governed.
- Version-controlled and auditable.
- Authoritative for policy and behavior constraints.

## Promotion boundary: ephemeral context -> reviewed durable knowledge

Promotion from `.playbook/context/*` and raw `.playbook/memory/events/*` into `.playbook/memory/knowledge/*` MUST cross an explicit review boundary.

Minimum promotion gates:

1. **Evidence threshold**: candidate knowledge references sufficient episodic evidence.
2. **Stability threshold**: pattern/insight is observed across more than one episode or run.
3. **Review threshold**: explicit reviewer approval (human or policy-authorized governance process).
4. **Versioning threshold**: durable artifact receives version metadata and change rationale.

Until these gates are satisfied, context and event artifacts remain non-normative inputs.

## Provenance requirements

All durable memory artifacts MUST include provenance metadata adequate for audit and replay.

Required provenance fields (minimum):

- Artifact identifier and version.
- Created/updated timestamps.
- Actor or process identity.
- Source references (event file IDs, commit SHAs, document/rule references).
- Promotion rationale (why this moved from candidate to durable).
- Review record (who/what approved promotion and when).

Provenance should enable a reviewer to trace each durable claim back to episodic evidence.

## Structural truth boundary

`.playbook/repo-graph.json` remains the structural repository truth for topology, module relationships, and architecture shape.

It is **not** the temporal memory store and MUST NOT be treated as an event history or long-term temporal memory ledger.

## Non-goals

- Defining a specific database, queue, or storage backend.
- Replacing deterministic command outputs with opaque memory retrieval.
- Allowing unreviewed ephemeral context to become normative policy.
- Collapsing structural intelligence (`repo-graph`) into temporal event memory.

## Notes candidates

Potential candidate note classes for future deterministic capture and promotion workflows:

- **Rule**: candidate normative constraints derived from recurring verified findings.
- **Pattern**: candidate reusable implementation or remediation templates validated across episodes.
- **Failure Mode**: candidate anti-pattern or recurring breakdown with conditions, signals, and mitigations.

These candidates should begin as draft artifacts and only become durable or normative after passing promotion and review gates.
