# Playbook Postmortem

Use this repo-scoped postmortem template to keep observed evidence, explanatory interpretation, model updates, and explicit promotion follow-ups separated.

This template is docs-first and artifact-light: it records reviewed evidence and candidate follow-ups without introducing any new mutation path.

## Summary

- **Date:** YYYY-MM-DD
- **Incident / Change:**
- **Scope:**
- **Primary evidence refs:**

## Facts

Record only observed evidence here.

Examples:
- command outputs
- timestamps and sequence of events
- file paths, commits, PRs, screenshots, logs, metrics, or user reports
- explicit unknowns that remain unresolved

Rule: facts are observed evidence, not explanation.

## Interpretation

Explain what the facts appear to mean.

Capture:
- likely causes or contributing conditions
- competing explanations still under review
- confidence level and what would falsify this interpretation

Rule: interpretation is the explanatory layer built on top of facts.

## Model Changes

Document what changed in the team's understanding.

Capture:
- assumptions that were corrected
- heuristics or mental models that should be revised
- workflow or system understanding that should now be considered more accurate

Rule: model changes record revised understanding, not yet-promoted doctrine.

## Promotion Candidates

List explicit, reviewable follow-ups that may deserve promotion into doctrine, memory, tests, automation, or docs.

Capture each candidate with:
- candidate type (`Rule`, `Pattern`, `Failure Mode`, `Docs`, `Test`, `Automation`, etc.)
- concise proposal
- evidence refs
- intended destination or review surface
- reviewer / owner

Rule: promotion candidates are explicit reviewed follow-ups, not automatic doctrine updates.

## Non-Promotion Notes

Capture useful observations that should remain attached to this postmortem but should not be promoted.

Examples:
- local context that is too specific to generalize
- observations with insufficient evidence
- temporary mitigations or one-off decisions

Rule: non-promotion notes preserve context without turning it into doctrine.
