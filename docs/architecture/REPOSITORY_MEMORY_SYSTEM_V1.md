# Repository Memory System v1 (Canonical Future-State Specification)

- feature_id: PB-V08-MEMORY-SYSTEM-001
- status: canonical future-state specification

## Purpose

Define the canonical memory model for Playbook-enabled repositories so temporal engineering memory is captured, promoted, and reused without weakening deterministic governance.

This specification establishes:

- the four memory layers,
- the canonical `.playbook/` artifact layout,
- the promotion boundary from ephemeral context to reviewed durable knowledge,
- provenance requirements,
- privacy/local-first constraints,
- and explicit non-goals.

## Canonical memory layers

### 1) Working memory

Working memory is ephemeral execution context used during an active task/session.

- Scope: current run, short-lived local context, in-flight scaffolding.
- Characteristics: overwriteable, pruneable, non-authoritative.
- Primary use: help agents/tools complete current workflows, not define durable truth.

### 2) Episodic memory

Episodic memory is time-ordered engineering history.

- Scope: events and outcomes across runs (verify/plan/apply cycles, decisions, command invocations).
- Characteristics: append-oriented, timestamped, actor/process attributed.
- Primary use: replay, audit trails, and source evidence for future promotion.

### 3) Semantic memory

Semantic memory is reviewed durable repository knowledge distilled from episodes.

- Scope: reusable insights, validated mappings, stable repository facts.
- Characteristics: versioned, provenance-backed, promotion-gated.
- Primary use: cross-session reuse with explicit evidence and review lineage.

### 4) Doctrine / procedural memory

Doctrine/procedural memory is normative guidance that governs behavior.

- Scope: rules, contracts, operating doctrine, approved procedures.
- Characteristics: PR-reviewed, version-controlled, policy-authoritative.
- Primary use: define what is allowed, required, and canonical for repository operation.

## Canonical artifact layout under `.playbook/`

### Structural runtime artifacts (remain structural, not temporal memory)

The following artifacts remain structural runtime intelligence artifacts:

- `.playbook/repo-index.json`
- `.playbook/repo-graph.json`

These files represent repository shape/intelligence used by command surfaces (`index/query/graph/ask/explain`) and are **not** temporal engineering memory stores.

### Temporal engineering memory root

All temporal engineering memory lives under:

- `.playbook/memory/*`

Canonical sub-layout:

- Working memory: `.playbook/memory/working/*`
- Episodic memory: `.playbook/memory/episodic/*`
- Semantic memory: `.playbook/memory/semantic/*`
- Doctrine/procedural memory derivatives or mirrors (optional, non-authoritative): `.playbook/memory/doctrine/*`

Normative doctrine still lives in governed repository surfaces (for example `AGENTS.md`, docs, rules, and contracts) even if derived mirrors exist under `.playbook/memory/doctrine/*`.

## Promotion boundary: ephemeral context -> reviewed durable knowledge

Promotion from ephemeral memory (working + episodic) into durable reusable knowledge (semantic and/or doctrine-level adoption) MUST cross an explicit review boundary.

Promotion gates (minimum):

1. **Evidence gate**: candidate references concrete episodic evidence.
2. **Repeatability gate**: signal appears across multiple episodes or contexts.
3. **Review gate**: explicit reviewer/policy approval is recorded.
4. **Versioning gate**: promoted artifact receives stable ID/version and rationale.
5. **Traceability gate**: provenance links allow backward traversal from claim -> source evidence.

Until all gates pass, artifacts remain candidates and MUST NOT be treated as normative policy.

## Provenance requirements

Durable memory artifacts MUST carry provenance sufficient for deterministic audit/replay.

Minimum provenance fields:

- Artifact ID and version.
- Created-at and updated-at timestamps.
- Author/actor/process identity.
- Source evidence references (event IDs, file paths, commit SHAs, command outputs).
- Promotion rationale.
- Review decision metadata (reviewer/policy, timestamp, decision outcome).

## Privacy and local-first stance

Repository memory is local-first by default.

- Memory artifacts are stored inside repository-controlled `.playbook/*` surfaces unless explicitly exported by user/operator intent.
- No cloud/remote synchronization is implied by this specification.
- Teams should treat memory content as potentially sensitive engineering context and apply least-privilege access, redaction, and retention controls.

## Explicit non-goals

Repository Memory System v1 (feature_id: PB-V08-MEMORY-SYSTEM-001) does **not**:

- Mandate a specific storage backend (database, queue, or external service).
- Replace deterministic command outputs with opaque memory retrieval.
- Allow unreviewed ephemeral context to become doctrine.
- Reclassify `.playbook/repo-index.json` or `.playbook/repo-graph.json` as temporal memory.
- Define hosted multi-tenant memory operations.

## Playbook Notes candidates

- **Pattern: Fast Episodic Store, Slow Doctrine Store**
  - Episodic capture should optimize for append speed and auditability.
  - Doctrine promotion should optimize for review quality, stability, and policy safety.

- **Rule: Working Memory Is Not Doctrine**
  - Working-memory artifacts are never policy-authoritative.
  - Promotion and review are mandatory before doctrine adoption.

- **Rule: Retrieval Must Return Provenance**
  - Any retrieval surface that returns memory-backed claims must include evidence references and lineage metadata.
  - Claims without provenance are treated as non-authoritative.

- **Failure Mode: Memory Hoarding**
  - Storing large volumes of uncurated episodic/working artifacts without promotion, pruning, or retention controls degrades retrieval quality and increases risk.
  - Mitigate via retention windows, compaction, and explicit promotion workflows.
