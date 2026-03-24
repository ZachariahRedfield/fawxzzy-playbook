# Singleton Consolidation Pattern

## Purpose
Some work items are parallelizable at the worker level, but final authorship of protected singleton narrative surfaces is not automatically safe to parallelize.

## Core Rule
"Parallelizable work is not automatically parallel-safe."

## Pattern
"Use worker-local fragments and receipts for parallelizable work, then perform final consolidation through a governed single-writer step for protected singleton docs."

## Failure Mode
"Direct concurrent authorship of singleton narrative surfaces creates overlap, race conditions, narrative drift, and non-deterministic final state."

## Definitions
- **protected singleton doc**: a narrative or contract surface with one canonical merged output path where direct concurrent worker authorship is unsafe.
- **worker fragment**: a scoped worker-local contribution artifact (summary, proposal, or delta candidate) intended for later integration.
- **receipt**: structured evidence describing worker inputs, decisions, outputs, and references used during fragment generation.
- **final consolidation**: a governed single-writer integration step that resolves overlap and applies coherent final updates to protected singleton docs.
- **implementation surface vs singleton narrative surface**:
  - implementation surface: worker-owned, partitionable surfaces (for example code or isolated module files) where direct parallel edits are often safe with ownership boundaries.
  - singleton narrative surface: shared narrative/contract docs requiring one coherent final storyline and deterministic merge authority.

## Protected Singleton Surface Guidance
Protected singleton docs are narrative or contract surfaces that should not be directly authored by parallel workers. Depending on repository scope, these may include:
- architecture docs
- roadmap docs
- changelog/release narrative surfaces
- AGENTS/governance docs

These examples are illustrative, not an exhaustive repository-wide classification set.

## Worker Fragment Principle
Workers may:
- analyze scoped inputs
- produce local fragments
- emit receipts / evidence / proposed deltas

Workers should not:
- directly co-author protected singleton docs in parallel

## Consolidation Principle
Final singleton-doc updates should occur through a controlled consolidation phase that:
- resolves overlap
- merges fragment outputs
- preserves narrative coherence
- enforces a single final authorship path for protected singleton surfaces

## Sequencing Constraint
Intended dependency shape:
1. partitioning / overlap detection
2. worker-local fragments / receipts
3. final singleton-doc consolidation
4. managed subagents / hooks / deeper automation

## Rule / Pattern / Failure Mode Labels
Rule:
- Parallelizable work is not automatically parallel-safe.

Pattern:
- Worker fragments + final consolidation for protected singleton docs.

Failure Mode:
- Direct concurrent authorship of singleton narrative surfaces.

## Design Heuristics
- Is this work parallelizable, or also parallel-safe at the write surface?
- Is the target a protected singleton doc?
- Should workers emit fragments instead of directly mutating the final narrative surface?
- Has overlap been partitioned or detected before consolidation?

## Future Enforcement Hook
This reusable pattern may later support:
- protected-surface write guards
- fragment/receipt contract validation
- overlap detection rules
- consolidation gating in verify/apply flows
