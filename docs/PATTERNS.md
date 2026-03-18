# Playbook Patterns

This document captures repo-level product and governance patterns that should remain stable across command, docs, and architecture changes.

Rule: Promote repeated pilot learnings into explicit doctrine rather than leaving them as tribal knowledge.

## Pattern: System → Interpretation Gap

Deterministic systems can emit outputs that are correct, complete, and still hard for humans to act on quickly.

The gap appears when raw artifacts, findings, or plans require a reader to already understand command contracts, artifact lineage, or architecture boundaries before they can decide what to do next.

- Source-of-truth artifacts stay canonical.
- Human actionability still requires interpretation.
- Product design must account for both truths at once.

Failure Mode: Correct-but-dense outputs that require system knowledge reduce actionability and adoption.

## Pattern: Interpretation Layer

Playbook should expose an interpretation layer that converts deterministic system truth into human-facing summaries, operator guidance, and next-step framing.

Interpretation is representational only:

- it does not modify source-of-truth artifacts
- it does not introduce nondeterministic state
- it derives human-facing summaries from deterministic system truth

Rule: Interpretation layers must remain read-only views over governed artifacts.
Pattern: Deterministic truth -> interpretation layer -> human action.

## Pattern: Progressive Disclosure

Operator surfaces should reveal the minimum useful summary first, then allow drill-down into evidence, artifacts, and architectural detail.

Use progressive disclosure when:

- the raw system truth is structurally dense
- different users need different levels of detail
- preserving trust requires showing derivation without forcing it up front

Pattern: Summary first, evidence on demand.

## Pattern: Single Next Action

When the system can identify a highest-confidence next move, it should present one clear next action before presenting a broad option set.

This keeps governed workflows actionable without hiding the surrounding evidence.

Rule: Prefer one justified next step over a flat list of equally weighted possibilities when confidence is sufficient.

## Pattern: State → Narrative Compression

Playbook should compress deterministic state into a short narrative a human can understand without manually stitching together multiple artifacts.

This narrative must be derived, not invented.

Pattern: State -> narrative compression -> operator understanding.
Failure Mode: Humans must reconstruct the story themselves from valid but overly fragmented artifacts.

## Pattern: Shared aggregation boundary for reads, targeted invalidation boundary for writes

Read-heavy product surfaces should converge through a shared aggregation boundary so multiple consumers can observe one consistent summary surface.

Write paths should invalidate only the affected deterministic summaries instead of forcing broad recomputation everywhere.

Rule: Aggregate reads centrally; scope write invalidation narrowly.
Pattern: Shared aggregation boundary for reads, targeted invalidation boundary for writes.

## Pattern: Mutation path → affected canonical IDs → centralized recompute

When a mutation occurs, the system should map it to the affected canonical IDs first, then hand recomputation to a centralized deterministic layer.

This keeps invalidation explainable, bounded, and reviewable.

Rule: Mutation effects must flow through canonical identifiers before recompute.
Pattern: Mutation path -> affected canonical IDs -> centralized recompute.

## Pilot-derived doctrine

The first external fitness pilot promoted the following repo-level doctrine:

- stabilize tooling surface before governed product work
- first governed improvements should target correctness/performance seams with repeated logic and clear invariants
- tooling migration incomplete until runtime + governance bootstrap proof passes

Failure Mode: A repo can look integrated while still failing real governed consumption due to missing bootstrap/runtime/artifact guarantees.
