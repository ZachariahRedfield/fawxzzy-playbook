# Playbook ↔ Lifeline remediation interop (v1)

## Scope boundary

This document defines a **remediation-first** interop contract that only covers the bounded loop:

1. `test-triage`
2. `test-fix-plan`
3. `apply-result`
4. `test-autofix`
5. `remediation-status`

No non-remediation orchestration is in scope for this v1.

## Canonical seam

`.playbook/rendezvous-manifest.json` is the canonical pause/resume/readiness seam.

Playbook may emit a bounded action request only when rendezvous evaluation is release-ready. Any non-ready state is represented as an explicit blocked reason.

## Contract surfaces

Interop schemas are published in `packages/contracts/src`:

- `remediation-interop-capability-registration.schema.json`
- `remediation-interop-action-request.schema.json`
- `remediation-interop-action-status.schema.json`
- `remediation-interop-execution-receipt.schema.json`
- `remediation-interop-heartbeat.schema.json`
- `remediation-interop-blocked-reason.schema.json`
- `remediation-interop-retry-reconcile-state.schema.json`
- `remediation-interop-store.schema.json`

These contracts establish durable, restart-safe state for requests, receipts, and health snapshots.

## Durable state model

Interop state persists at:

- `.playbook/remediation-interop-store.json`

The store includes:

- capability registrations
- bounded requests
- execution receipts
- heartbeat/health snapshots
- reconcile buckets for `pending`, `running`, `failed`, `completed`, `blocked`, `rejected`

## Adapter semantics

### Playbook adapter

- reads rendezvous manifest + evaluation
- emits bounded requests only when release-ready
- records explicit blocked status if release is not ready
- never treats execution as real without a receipt

### Lifeline mock adapter (fixture runtime)

- registers capability support for remediation actions
- receives requests from durable store
- executes idempotently via request idempotency key
- emits execution receipts and heartbeat snapshots
- supports explicit rejection/blocked outcomes

## Reconcile/evaluate loop

`reconcile` computes deterministic buckets from durable requests, so pause/resume survives process restarts:

- pending
- running
- failed
- completed
- blocked
- rejected

## Inspect surfaces

`playbook interop inspect` exposes:

- capabilities
- requests
- latest receipts
- heartbeat/health
- reconcile state

## Governance bullets

- **Rule:** No action is considered real until a receipt returns to Playbook.
- **Pattern:** plan -> bounded request -> execution -> receipt -> updated truth
- **Failure Mode:** Execution without receipts causes silent drift and destroys trust.
