# Lanes (`pnpm playbook lanes`)

`lanes` derives deterministic active lane-state from `.playbook/workset-plan.json` and writes `.playbook/lane-state.json`.

## Why this exists

Workset plans are static planning artifacts. Lane-state turns those plans into explicit tracked orchestration state without launching workers or mutating branches.

Rule — Planned lanes must become explicit tracked state before they become autonomous execution units.

Pattern — Workset planning becomes much more operationally useful when each lane has a deterministic readiness state.

Failure Mode — Orchestration without lane-state turns planning artifacts into dead documents instead of an active control system.

## Usage

```bash
pnpm playbook lanes --json
```

## Inputs

- Requires `.playbook/workset-plan.json` from `pnpm playbook orchestrate --tasks-file <path>`.

## Outputs

Writes `.playbook/lane-state.json` with:

- top-level lane counts and status groupings (`blocked_lanes`, `ready_lanes`, `running_lanes`, `completed_lanes`)
- deterministic per-lane readiness (`status`, `dependencies_satisfied`, `blocked_reasons`)
- conservative merge and verification posture (`merge_readiness`, `verification_status`)

`lanes` remains proposal-only and does not create branches, launch workers, open PRs, or merge code.
