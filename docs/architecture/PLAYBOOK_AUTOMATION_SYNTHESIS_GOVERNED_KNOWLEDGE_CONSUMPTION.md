# Playbook Automation Synthesis Governed Knowledge Consumption Architecture

## Purpose

This document is the canonical architecture slice for governed Automation Synthesis knowledge consumption.

It defines strict contract boundaries for:

- allowed vs forbidden synthesis inputs
- suggestion-only authority in the initial slice
- provenance-linked output packaging
- rollback/deactivation accountability envelopes

Automation Synthesis is downstream of deterministic runtime, governed memory promotion, and read-only knowledge inspection surfaces. This slice is intentionally bounded and does **not** authorize autonomous repository mutation or deployment behavior.

## Docs summary labels

- Pattern: Governed Knowledge Before Automation
- Pattern: Suggestion-Only Synthesis Boundary
- Pattern: Provenance-Linked Suggestion Packaging
- Rule: Automation Synthesis may only consume promoted, inspectable, provenance-linked knowledge
- Rule: Candidate knowledge is not synthesis-eligible input
- Rule: Suggestion outputs are non-authoritative until downstream governed approval
- Rule: Rollback/deactivation accountability metadata is mandatory even for suggestion-only outputs
- Rule: Automation Synthesis packaging must fail closed when provenance, freshness/lifecycle, confidence/rationale, or rollback accountability metadata is incomplete
- Pattern: promoted knowledge -> validated suggestion package -> explicit downstream review
- Failure Mode: Synthesis built from opaque memory
- Failure Mode: Candidate knowledge treated as doctrine
- Failure Mode: Provenance-free synthesis packages
- Failure Mode: Output consumption without rollback accountability metadata
- Failure Mode: Suggestion-only surfaces become unsafe when packaging accepts incomplete provenance or rollback metadata

## Canonical boundary

Automation Synthesis in this slice is **suggestion-generation only**.

Allowed in this slice:

- deterministic generation of reviewable suggestions/packages
- explicit policy-linked packaging for review workflows
- read-only inspection and context synthesis over allowed inputs

Forbidden in this slice:

- autonomous repository mutation
- autonomous execution/deployment
- hidden background mutation loops
- bypass of existing `verify -> plan -> apply` repository mutation governance

Rule: Automation Synthesis may produce proposal artifacts, not execution authority.

## Allowed vs forbidden synthesis inputs

### Allowed synthesis inputs

Automation synthesis context may include only policy-allowed, inspectable, provenance-linked inputs:

1. promoted governance knowledge artifacts (active/reviewed state)
2. approved reusable patterns and doctrine artifacts
3. deterministic repository intelligence artifacts (index/query/explain/ask contracts)
4. policy-approved templates that declare required input classes
5. session/evidence references where lineage is preserved and referenced knowledge is promotion-reviewed

All allowed inputs must carry lineage fields sufficient for replay/audit (for example: knowledge identifiers, source artifact references, fingerprints, and freshness or lifecycle state).

### Forbidden synthesis inputs

The following are forbidden as direct synthesis inputs:

- raw chat transcripts or opaque prompt-memory fragments
- unreviewed candidate knowledge artifacts
- provenance-free inferred rules
- stale/superseded knowledge without explicit, audited override
- repo-local sensitive artifacts outside declared policy scope

Hard disallow: raw evidence and candidate artifacts cannot be treated as automation-grade synthesis input in this slice.

## Suggestion-only contract surface

Synthesis outputs are advisory proposal artifacts and must remain non-authoritative.

Required output posture:

- suggestions are review-facing and policy-gated for any downstream operational path
- no output from this slice is directly executable by default
- mutation/execution authority remains in existing governed command seams

Rule: suggestion-generation does not widen runtime mutation authority.

## Provenance-linked output contract

Every synthesis output package must include a provenance envelope.

Minimum required envelope fields:

- synthesis run identifier
- template/pattern family identifier
- cited knowledge/evidence references used to generate the suggestion
- source artifact paths or stable artifact identifiers
- promotion/review state and freshness metadata for consumed knowledge

Rule: outputs lacking complete provenance metadata fail closed for downstream governed consumption.

Runtime/read path note: synthesis packaging should surface deterministic `validationSummary` and explicit rejected rows so operators can inspect fail-closed reasons without hidden interpretation.

## Rollback accountability envelope

Even suggestion-only outputs must carry rollback/deactivation accountability metadata so downstream operators can evaluate reversibility before any operationalization.

Required accountability metadata:

- declared rollback/deactivation path reference
- expected blast-radius summary class
- monitoring signals expected to indicate bad outcomes
- actor/policy decision linkage fields for later approvals or denials

Rule: rollback/deactivation accountability is a required contract boundary, not optional guidance.

## Pipeline placement

Automation Synthesis consumes upstream governed layers in this order:

1. deterministic runtime + session/evidence
2. control-plane policy and approvals
3. review-loop and longitudinal promoted knowledge
4. knowledge query/inspection surfaces
5. automation synthesis (suggestion-only in this slice)

Dependency ladder:

`deterministic runtime -> session/evidence -> control plane -> review loop -> repo longitudinal promoted knowledge -> knowledge query/inspection -> automation synthesis (suggestion-only)`

## Guardrails and non-goals

- Do not reposition Playbook as a general autonomous coding agent.
- Do not permit opaque-memory synthesis as doctrine-level input.
- Do not collapse candidate and promoted knowledge classes.
- Do not bypass policy, review, provenance, or rollback accountability envelopes.

## Cross-links

- `docs/PLAYBOOK_PRODUCT_ROADMAP.md`
- `docs/commands/README.md`
- `docs/architecture/PLAYBOOK_SESSION_EVIDENCE_ARCHITECTURE.md`
- `docs/architecture/PLAYBOOK_CONTROL_PLANE_ARCHITECTURE.md`
- `docs/architecture/PLAYBOOK_REPO_LONGITUDINAL_STATE_AND_KNOWLEDGE_PROMOTION.md`
- `docs/architecture/PLAYBOOK_KNOWLEDGE_QUERY_SURFACES.md`
- `docs/architecture/PLAYBOOK_OUTCOME_FEEDBACK_AND_AUTOMATION_RUNTIME_LEARNING.md`
