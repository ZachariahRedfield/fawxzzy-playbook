# Roadmap Contracts

This directory contains roadmap support artifacts used by CI, planning, and AI automation.

## Source-of-truth boundaries

1. **Strategic roadmap source of truth**: `docs/PLAYBOOK_PRODUCT_ROADMAP.md`.
2. **Machine-readable roadmap contract**: `docs/roadmap/ROADMAP.json`.
3. **Canonical architecture dependency map**: `docs/architecture/PLAYBOOK_FINAL_ARCHITECTURE_MAP_AND_CANONICAL_DEPENDENCY_INDEX.md`.
4. **Backlog for emerging ideas**: `docs/roadmap/IMPROVEMENTS_BACKLOG.md`.
5. **Execution window**: `docs/roadmap/IMPLEMENTATION_PLAN_NEXT_4_WEEKS.md` and `docs/roadmap/WEEK0_WEEK1_EXECUTION_VALIDATOR.md`.

Rule: One strategic roadmap, one machine-readable roadmap contract.
Rule: Architecture-defined scope is not implementation commitment.
Rule: Backlog items are unscheduled and pre-architecture unless explicitly marked exploratory.

## Role of each document

- `docs/PLAYBOOK_PRODUCT_ROADMAP.md`: strategic sequencing and commitment posture.
- `docs/roadmap/ROADMAP.json`: CI-validated implementation contract (`feature_id`, dependencies, status, ownership, verification commands).
- `docs/architecture/PLAYBOOK_FINAL_ARCHITECTURE_MAP_AND_CANONICAL_DEPENDENCY_INDEX.md`: dependency order and trust-boundary map for architecture slices.
- `docs/roadmap/IMPROVEMENTS_BACKLOG.md`: emerging ideas that are not yet architecture-defined or roadmap-committed.
- `docs/roadmap/IMPLEMENTATION_PLAN_NEXT_4_WEEKS.md` and `docs/roadmap/WEEK0_WEEK1_EXECUTION_VALIDATOR.md`: active build queue only.

## Promotion flow

Pattern: Backlog -> Architecture -> Roadmap -> Implementation

Move an idea forward only when its boundary is clear:

1. **Backlog -> Architecture**: promote when the idea needs canonical dependency placement or trust-boundary definition.
2. **Architecture -> Roadmap contract**: promote when architecture-defined scope becomes sequencing intent.
3. **Roadmap contract -> Implementation**: promote when dependencies are satisfied and work is execution-ready for the active plan window.

Rule: Backlog holds emerging ideas, not already-structured architecture.
Failure Mode: Idea soup after architecture is already defined.

## Navigation

- Start with `docs/PLAYBOOK_PRODUCT_ROADMAP.md` for strategic direction.
- Use `docs/roadmap/ROADMAP.json` for machine-readable implementation truth.
- Use `docs/architecture/PLAYBOOK_FINAL_ARCHITECTURE_MAP_AND_CANONICAL_DEPENDENCY_INDEX.md` for dependency ordering.
- Use `docs/roadmap/IMPROVEMENTS_BACKLOG.md` for unscheduled or exploratory ideas.
- Use the implementation plan docs only for near-term execution.

Rule: Roadmap entries represent planned intent; implemented command truth comes from shipped CLI/contracts.

## Docs summary labels

- Pattern: One Machine-Readable Contract
- Rule: Architecture-defined does not equal implemented
- Pattern: Architecture Then Contract Then Implementation
- Rule: Build order follows trust and dependency order
- Failure Mode: Leaving research mode without execution shape
- Failure Mode: ROADMAP.json lagging behind merged roadmap truth

## Implementation sequencing contract

The roadmap execution shape is dependency-ordered and must stay aligned between markdown roadmap and `ROADMAP.json`:

1. Implemented baseline
2. Active hardening
3. Next buildable slices
4. Later platform layers
5. Product/business overlays

Rule: Do not promote later platform or overlay work ahead of trust/runtime dependency prerequisites.
