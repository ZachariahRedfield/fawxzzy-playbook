# Roadmap Contracts

This directory contains roadmap support artifacts used by CI, planning, and AI automation.

## Canonical truth boundaries

1. **Strategic roadmap intent**: `docs/PLAYBOOK_PRODUCT_ROADMAP.md`.
2. **Machine-readable roadmap commitments**: `docs/roadmap/ROADMAP.json`.
3. **Backlog for unscheduled ideas**: `docs/roadmap/IMPROVEMENTS_BACKLOG.md`.
4. **Historical execution snapshots**: archived under `docs/archive/roadmap/`.

Rule: command implementation status is **not** authored in roadmap documents; use `docs/commands/README.md` for live command truth.

## Role of each document

- `docs/PLAYBOOK_PRODUCT_ROADMAP.md`: strategic direction, sequencing, and commitment posture.
- `docs/roadmap/ROADMAP.json`: CI-validated implementation contract (`feature_id`, dependencies, status, ownership, verification commands).
- `docs/roadmap/IMPROVEMENTS_BACKLOG.md`: emerging ideas not yet committed in roadmap sequencing.
- `docs/archive/roadmap/*`: historical and transitional execution plans retained for context, not operator guidance.

## Promotion flow

Pattern: Backlog -> Architecture -> Roadmap contract -> Implementation

Move an idea forward only when its boundary is clear:

1. **Backlog -> Architecture**: promote when canonical dependency placement or trust-boundary definition is required.
2. **Architecture -> Roadmap contract**: promote when architecture-defined scope becomes sequencing intent.
3. **Roadmap contract -> Implementation**: promote when dependencies are satisfied and work is execution-ready.

Failure mode: planning drift where archived execution checklists are treated as active roadmap truth.
