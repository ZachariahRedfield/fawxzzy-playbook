# Playbook UI Guidelines

This document defines presentation doctrine for human-facing Playbook surfaces.

Rule: UI layers must improve actionability without competing with deterministic artifact truth.

## Representation boundary

The interpretation layer is representational only:

- it does not modify source-of-truth artifacts
- it does not introduce nondeterministic state
- it derives human-facing summaries from deterministic system truth

Any UI or presentation surface that changes meaning or state outside governed artifacts violates the architecture boundary.

## Guideline: Design for the System → Interpretation Gap

Assume many users will encounter correct but dense outputs before they understand the full system.

UI should therefore:

- translate governed state into plain language
- preserve easy access to underlying evidence
- avoid forcing command/architecture expertise for routine decisions

Failure Mode: Correct-but-dense outputs that require system knowledge reduce actionability and adoption.

## Guideline: Progressive Disclosure

Show layers in this order when possible:

1. current status
2. single next action
3. short narrative summary
4. supporting evidence and artifacts
5. full system detail

Pattern: Progressive Disclosure.

## Guideline: Single Next Action

When confidence is adequate, present one primary recommended action with a short reason.

Use secondary actions as expandable alternatives, not as the default top-level presentation.

Pattern: Single Next Action.

## Guideline: State → Narrative Compression

Summaries should explain what happened, why it matters, and what should happen next using deterministic evidence as the source.

Preferred structure:

- What changed?
- Why is it important?
- What is the next governed action?

Pattern: State -> Narrative Compression.

## Guideline: Interpretation Layer outputs

Interpretation outputs should help humans answer:

- What happened?
- What worked?
- Where was the friction?
- Which product gap was exposed?
- What should we improve next?

This is especially important for pilot review, PR review, docs audit, and control-plane summaries.

## Pilot doctrine for future UI work

The external fitness pilot indicates that the next high-value presentation work should emphasize:

- environment/runtime health diagnostics before deep analysis
- next-best-improvement selection rather than broad undifferentiated suggestion lists
- post-merge doctrine extraction from successful governed work
- readable interpretation of dense system truth for humans
