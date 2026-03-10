# Toroidal Flow (architectural overlay)

Toroidal Flow is an additive architecture model that frames Playbook as a **deterministic closed-loop intelligence system**.

It does **not** rename or replace the existing lifecycle, command ladder, or runtime contracts.

Current canonical ladders remain intact:

- serious-user ladder: `ai-context -> ai-contract -> context -> index -> query/explain/ask --repo-context -> verify -> plan -> apply -> verify`
- machine-safe remediation loop: `verify -> plan -> apply -> verify`

## Why this model exists

Playbook already has both execution and intelligence-lifecycle components. Toroidal Flow formalizes how they connect:

- forward execution produces deterministic outcomes
- return intelligence processes outcomes into reusable knowledge
- governance decides what may re-enter future context

This keeps runtime behavior deterministic while preventing open-loop knowledge loss.

## Toroidal model at a glance

```text
            ┌───────────────────────────────┐
            │       Central Invariants      │
            │ intent / contracts / schemas  │
            │ evidence / governance rules   │
            └──────────────┬────────────────┘
                           │
        Forward Execution Arc               Return Intelligence Arc
   observe -> verify -> plan -> apply -> extract -> canonicalize -> compact
                           ^                                        |
                           |                                        v
                        next context <- promote <- retire <- reviewed patterns
```

## Forward Execution Arc

Execution-facing phases:

1. `observe`
2. `verify`
3. `plan`
4. `apply`

`apply` is the **midpoint**, not the endpoint. It closes the execution half of a lap, but intelligence return and governance gating still determine whether any durable learning is produced.

## Return Intelligence Arc

Intelligence and governance-facing phases:

1. `extract`
2. `canonicalize`
3. `compact`
4. `promote` (optional, review-gated)
5. `retire` (optional, governance-driven)

Key constraint:

- extracted knowledge does not automatically re-enter planning/context
- only promoted knowledge may re-enter context assembly or reusable intelligence surfaces
- retirement and promotion are not mandatory outputs of every lap

## Central Invariant Layer

All phases are bounded by central deterministic invariants:

- intent
- contracts
- schemas
- evidence requirements
- governance rules

These invariants prevent open-loop mutation and preserve reproducibility across CLI, CI, and automation surfaces.

## Phase-output expectations

Toroidal Flow distinguishes output classes by phase role:

- `verify` / `plan` / `apply`: execution-facing outputs
- `extract` / `canonicalize` / `compact`: intelligence-facing outputs
- `promote` / `retire`: governance-facing state transitions

`nextContextDelta` is derived from approved/promoted knowledge only, never from raw extracted content.

## Closed-loop acceptance terms

- **Loop closure**: a run has complete forward execution plus return-intelligence handling with deterministic artifacts.
- **Compaction**: canonical evidence is deterministically compared and bucketed before governance decisions.
- **Promotion**: optional reviewed elevation from compacted artifacts into reusable intelligence.
- **Retirement**: optional lifecycle state transition for stale/superseded promoted knowledge.
- **Midpoint apply**: execution completion point, not the end of system intelligence work.
- **Closed-loop vs open-loop**:
  - closed-loop: outcomes are captured, canonicalized, compacted, and governance-gated before reuse
  - open-loop: execution stops at apply, causing learning loss/drift

## Rules, patterns, failure modes

Rule: Nothing may be fed back into planning/context unless it has passed:
`extract -> canonicalize -> compact -> promote`.

Pattern: Every Playbook run is a deterministic closed-loop cycle, not a terminal command.

Failure Mode: Open-loop apply causes knowledge loss, drift, duplicate patterns, and memory-heap behavior.

Failure Mode: Forced promotion on every cycle turns the loop into noisy memory mutation instead of governed intelligence.

## Contract alignment

The shared `RunCycle` contract is defined in `packages/core/src/knowledge/run-cycle.ts` as an additive deterministic type surface for one full lap of execution + intelligence return.

This contract is architecture-facing in this pass. It does not imply a new public runtime API, and it does not change command behavior.
