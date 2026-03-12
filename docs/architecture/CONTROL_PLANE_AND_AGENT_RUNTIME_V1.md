# Control Plane and Agent Runtime v1 (Future State)

## Purpose and scope

This document defines a **future-state-only** architecture for a Playbook control plane coordinating agent runtime behavior.

It intentionally describes target behavior and governance boundaries, not a statement that all capabilities are implemented today.

Rule: The control plane is an orchestration and policy layer **above** deterministic engine governance, not a replacement for it.
Rule: Agents do not bypass Playbook engine mutation controls.

## Architecture diagram

```mermaid
flowchart TD
    H[Human / CI / API Caller] --> CP[Control Plane]

    subgraph Runtime[Agent Runtime]
      CP --> Q[Task Queue]
      Q --> A1[Agent Worker]
      Q --> A2[Agent Worker]
      A1 --> O[Observer]
      A2 --> O
      A1 --> E[Executor]
      A2 --> E
    end

    subgraph GovernedCore[Deterministic Playbook Engine]
      V[verify] --> P[plan]
      P --> AP[apply]
      AP --> V2[verify]
    end

    E --> V
    E --> P
    E --> AP
    E --> V2

    O --> T[Runtime Telemetry + State]
    CP --> G[Approval Gates + Safety Policy]
    G --> E

    M[Memory Surfaces\n(repo-local / promoted)] --> CP
    M --> O

    classDef boundary fill:#f6f8fa,stroke:#333,stroke-width:1px;
    class Runtime,GovernedCore boundary;
```

## Boundary model

### 1) Control plane

The control plane owns policy, scheduling intent, actor identity, approval gating, and lifecycle orchestration.

It does not perform arbitrary mutation directly; it authorizes and routes execution through governed engine interfaces.

### 2) Agents

Agents are policy-constrained runtime workers that execute assigned tasks using allowed tools and bounded scopes.

Agents are stateful only through explicit runtime-state artifacts and governed memory access.

### 3) Observers

Observers are non-mutating runtime components that collect lifecycle events, execution traces, queue transitions, and decision metadata.

Observers feed telemetry/state records and provide evidence for audits and rollback analysis.

### 4) Executors

Executors are mutation-capable workers that invoke Playbook commands under control-plane authorization.

Executors never bypass deterministic controls; all repository mutation remains mediated by engine contracts.

### 5) Playbook engine

The Playbook engine remains the deterministic mutation and governance trust boundary.

Canonical mutation path remains `verify -> plan -> apply -> verify`, with optional `explain` for diagnostics.

## Responsibilities

### Agent lifecycle

- registration, capability declaration, health heartbeat
- lease/claim task assignment
- runtime-state transitions (`queued`, `running`, `awaiting-approval`, `succeeded`, `failed`, `canceled`)
- graceful shutdown, retry handoff, and stale-agent recovery

### Task scheduling

- queue admission control and deduplication
- priority-aware dispatching
- fairness and starvation prevention
- dependency ordering between tasks

### Approval gates

- route tasks to appropriate approval policy based on mutation scope
- block execution at `awaiting-approval` until explicit approval artifact exists
- ensure approver identity and decision are linked to runtime evidence

### Safety policy

- command allowlists, path/module scope constraints, and side-effect boundaries
- fail-closed behavior when policy inputs are ambiguous or missing
- enforcement of deterministic run contracts for mutation operations

### Runtime telemetry

- queue metrics (depth, wait time, retries)
- lifecycle event streams (claim/start/finish/fail)
- policy and approval decision traces
- evidence bundles for post-run review and audits

### Memory access

- explicit separation between repo-local memory and promoted/shared knowledge
- read/write permissions by actor class and task type
- provenance requirement for writes that influence future automation

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
  "requiresApproval": true,
  "approvalPolicy": "owner-required",
  "retryPolicy": { "maxAttempts": 3, "backoff": "exponential" },
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
  "state": "idle",
  "lease": { "taskId": null, "expiresAt": null },
  "lastHeartbeatAt": "ISO-8601",
  "policyVersion": "v1",
  "telemetryChannel": "runtime://events"
}
```

## Lifecycle model

1. Task submitted to control plane with requested mutation scope and intent.
2. Control plane validates policy preconditions and computes required approvals.
3. Scheduler enqueues task with priority, retry policy, and dependencies.
4. Agent claims lease and executes bounded preflight checks.
5. If approval required, task transitions to `awaiting-approval`.
6. Upon approval, executor runs governed workflow (`verify -> plan -> apply -> verify`).
7. Observer records outputs, artifacts, decision lineage, and terminal state.
8. Control plane closes task, emits summary, and stores runtime evidence.

## Safety model

- **No bypass invariant:** agents and executors cannot directly mutate outside Playbook engine contracts.
- **Control-plane-above-engine invariant:** control plane governs *whether/how* to run; engine governs deterministic mutation correctness.
- **Fail-closed invariant:** missing approval, missing evidence, or policy ambiguity blocks mutation.
- **Scoped authority invariant:** agent capabilities must be subset-constrained by policy profile and task scope.
- **Auditability invariant:** each mutation-capable run must preserve command lineage and approver linkage.

## Telemetry and runtime-state model

### Required runtime states

- `queued`
- `leased`
- `running`
- `awaiting-approval`
- `retry-scheduled`
- `succeeded`
- `failed`
- `canceled`

### Required telemetry dimensions

- actor (`human`, `ci`, `api`, `agent`)
- task type + scope
- queue timing (enqueue delay, execution duration)
- retry and failure reason taxonomy
- approval path and approver class
- command lineage and artifact references

## Queueing concepts (v1)

- **Priority:** deterministic priority classes (`urgent`, `high`, `normal`, `low`) with fairness controls.
- **Retries:** bounded retries with explicit failure classification and jittered/exponential backoff.
- **Logs:** append-only task event logs with immutable timestamps and lineage references.
- **Approvals:** queue-integrated approval holds that preserve lease safety and avoid duplicate execution.

## Relationship to Automation Synthesis and roadmap direction

This architecture is a control and runtime foundation for future Automation Synthesis surfaces.

It positions synthesis-generated actions as untrusted until they pass control-plane policy and deterministic engine verification.

Roadmap direction:

- near-term: human/CI-driven assisted automation with strict approval gates
- mid-term: policy-routed multi-agent orchestration over deterministic command contracts
- long-term: synthesis-aware autonomous tasking constrained by governed knowledge and fail-closed controls

## Explicit mapping to `verify -> plan -> apply -> verify`

- **Control plane:** authorizes execution route, scope, and approvals for the workflow.
- **Agent runtime:** schedules and executes workflow steps under lease and policy constraints.
- **Executor:** invokes `verify`, `plan`, `apply`, then final `verify` using deterministic interfaces.
- **Observer:** captures findings, plan artifacts, apply outputs, and post-verify status as evidence.
- **Approval gates:** can block before `apply` (or earlier) based on scope/policy.

`verify -> plan -> apply -> verify` remains the canonical mutation loop, even when wrapped by higher-level control-plane orchestration.

## Notes candidates

Pattern: Control Plane Above Deterministic Engine Governance.
Pattern: Agents as Policy-Constrained Executors, Not Autonomous Mutators.
Pattern: Queue-Centric Approval Holds Preserve Deterministic Execution.
Rule: Agents must not bypass Playbook engine mutation controls.
Rule: Control-plane policy decisions must fail closed when evidence or approvals are missing.
Rule: Mutation-capable tasks must preserve runtime telemetry and command lineage.
Failure Mode: Hidden side-channel mutation outside governed engine contracts.
Failure Mode: Approval bypass via direct executor invocation.
Failure Mode: Priority inversion causing safety-critical tasks to starve.
Failure Mode: Retries without failure classification causing repeated unsafe execution.
