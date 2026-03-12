# Playbook Control Plane and Agent Runtime v1 (Canonical Future-State Spec)

## Purpose

This document defines the canonical **future-state** architecture for Playbook Control Plane / Agent Runtime v1.

It specifies boundaries, responsibilities, and minimum contracts for control-plane-directed agent execution while preserving Playbook's deterministic mutation governance.

Rule: The control plane is an orchestration and policy layer **above** the Playbook engine.
Rule: Agents and executors **never bypass** the engine's mutation controls.

## Non-goals

- This is not a claim that all capabilities are implemented today.
- This does not replace deterministic engine workflows.
- This does not grant direct mutation authority to autonomous agents.

## Subsystem boundaries

### 1) Playbook engine (deterministic mutation trust boundary)

The Playbook engine is the canonical mutation and governance boundary.

- Owns deterministic command contracts and mutation invariants.
- Owns canonical remediation loop: `verify -> plan -> apply -> verify`.
- Rejects out-of-contract mutation attempts.

### 2) Control plane (orchestration and policy boundary)

The control plane decides **whether**, **when**, and **under what policy** tasks execute.

- Owns task intake, admission, prioritization, and scheduling policy.
- Owns approval-gate policy and safety-policy enforcement decisions.
- Owns lifecycle state machine and dispatch/lease control.
- Does not directly mutate repositories outside engine-governed interfaces.

### 3) Agents (policy-constrained workers)

Agents are workers that claim tasks and execute approved workflows.

- Operate within declared capabilities and scoped authority.
- Execute only assigned tasks under lease.
- Persist state only through governed runtime artifacts.

### 4) Observers (non-mutating evidence and telemetry boundary)

Observers record runtime behavior and decision lineage.

- Capture lifecycle events, queue transitions, and policy decisions.
- Capture command lineage and evidence references.
- Never perform repository mutation.

### 5) Executors (mutation-capable runtime adapters)

Executors invoke deterministic engine commands on behalf of agents.

- Translate approved task intent to engine invocations.
- Enforce control-plane constraints (scope, policy, approvals) at execution time.
- Must fail closed if required approvals/policy evidence is missing.

## Responsibility model

### Agent lifecycle

- Register and advertise capabilities.
- Emit health heartbeats.
- Claim, renew, and release task leases.
- Transition through runtime states (`queued`, `leased`, `running`, `awaiting-approval`, `retry-scheduled`, terminal states).
- Recover from stale lease or worker loss via reassignment policy.

### Task scheduling

- Admission control and deduplication.
- Deterministic queueing with dependency constraints.
- Fairness and anti-starvation handling.
- Work-conserving dispatch with policy-aware routing.

### Retry and priority

- Priority classes: `urgent`, `high`, `normal`, `low`.
- Bounded retries with explicit failure classification.
- Backoff/jitter policies to prevent retry storms.
- Priority inversion mitigation for safety-critical tasks.

### Approval gates

- Compute required approvals from mutation scope + policy profile.
- Hold tasks in `awaiting-approval` until valid approval artifact exists.
- Bind approver identity, decision, and timestamp to execution evidence.

### Safety policy

- Command allowlists and denied operations.
- Path/module/scope constraints.
- Side-effect boundaries by task class.
- Fail-closed semantics for missing/ambiguous policy inputs.

### Runtime telemetry

- Queue depth, wait time, lease churn, and retry metrics.
- Lifecycle event stream and failure taxonomy.
- Policy/approval decision traces.
- Immutable evidence bundles for audit and rollback analysis.

### Memory access

- Separation of repo-local working memory vs promoted/shared memory.
- Policy-scoped read/write permissions by actor and task type.
- Provenance and lineage required for automation-influencing writes.

## Minimal task model (v1)

```json
{
  "taskId": "task_123",
  "type": "governance-remediation",
  "priority": "high",
  "requestedBy": "human|ci|api",
  "targetRepo": ".",
  "mutationScope": "L0|L1|L2|L3|L4",
  "requiredWorkflow": ["verify", "plan", "apply", "verify"],
  "dependencies": ["task_101"],
  "requiresApproval": true,
  "approvalPolicy": "owner-required",
  "retryPolicy": { "maxAttempts": 3, "backoff": "exponential-jitter" },
  "status": "queued",
  "createdAt": "ISO-8601",
  "evidenceRef": "session://..."
}
```

## Minimal agent model (v1)

```json
{
  "agentId": "agent_abc",
  "class": "deterministic-executor",
  "capabilities": ["verify", "plan", "apply", "explain"],
  "allowedScopes": ["L0", "L1", "L2"],
  "state": "idle|busy|degraded|offline",
  "lease": { "taskId": null, "expiresAt": null },
  "lastHeartbeatAt": "ISO-8601",
  "policyVersion": "v1",
  "telemetryChannel": "runtime://events"
}
```

## Canonical execution flow

1. Task is submitted with intent, scope, and requester identity.
2. Control plane validates policy preconditions and computes approvals.
3. Scheduler enqueues with priority, dependencies, and retry policy.
4. Agent claims task lease and performs bounded preflight checks.
5. If approvals are required, task pauses in `awaiting-approval`.
6. Executor invokes governed engine loop: `verify -> plan -> apply -> verify`.
7. Observer records command lineage, policy decisions, artifacts, and outcome.
8. Control plane writes terminal state and emits completion evidence.

## Invariants

- **No-bypass invariant:** agents/executors cannot mutate outside engine-governed interfaces.
- **Control-plane-above-engine invariant:** control plane governs orchestration/policy; engine governs mutation correctness.
- **Fail-closed invariant:** missing approval/evidence/policy blocks mutation.
- **Scoped-authority invariant:** agent capability must be a strict subset of policy + task scope.
- **Auditability invariant:** mutation-capable runs preserve immutable lineage.

## Control Plane vs Automation Synthesis

Control Plane and Automation Synthesis are distinct:

- **Control Plane** = runtime governance, scheduling, approvals, policy enforcement, and evidence.
- **Automation Synthesis** = generation/proposal of candidate actions or plans.

Synthesis outputs are **untrusted proposals** until they pass control-plane policy and engine deterministic execution.

Therefore, synthesis does not gain direct mutation rights; it is upstream of governed execution.

## Rule / Pattern / Failure Mode note candidates

Pattern: Control plane governs orchestration while the engine governs mutation.
Pattern: Queue-integrated approval holds preserve deterministic safety.
Pattern: Agents are policy-constrained executors, not autonomous mutators.
Rule: Agents and executors must not bypass Playbook engine mutation controls.
Rule: Mutation-capable tasks require approval and evidence linkage when policy demands.
Rule: Runtime state transitions and command lineage must be telemetry-visible and auditable.
Failure Mode: Hidden side-channel mutation outside engine-governed interfaces.
Failure Mode: Approval bypass through direct executor invocation.
Failure Mode: Priority inversion starving high-safety tasks.
Failure Mode: Unbounded retries causing repeated unsafe execution.
Failure Mode: Memory writes without provenance contaminating future automation.
