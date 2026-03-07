# Playbook Improvement Backlog

## Purpose

This document captures feature ideas, architectural improvements, and workflow opportunities discovered during development.

Items here are **not yet committed roadmap work**.

They are promoted to the roadmap when they become prioritized product capabilities.

## Lifecycle

Idea  
↓  
Improvement Backlog  
↓  
Roadmap  
↓  
Implemented  
↓  
Archive

This structure prevents roadmap bloat while preserving engineering intelligence discovered during development.

---

## Query System Ideas

- Dependency graph query  
  Command: `playbook query dependencies`

- Impact analysis query enhancements  
  Command: `playbook query impact <module>`

---

## Developer Workflow Intelligence

- Pull request analysis  
  Command: `playbook analyze-pr`

Potential capabilities:

- modules affected by change
- architectural blast radius
- risk score
- missing tests
- documentation coverage gaps

---

## Risk Intelligence Enhancements

- `playbook query risk --top`

Purpose:  
Rank highest-risk modules in the repository.

---

## Follow-up Opportunities

- `playbook backlog audit`

Purpose:  
Automatically detect implemented improvements and archive them.

---

## Docs Governance Follow-ups

- Pattern: Documentation responsibility boundaries should be enforced by moving idea content to the improvement backlog rather than duplicating planning language across docs.
- Rule: `docs/AI_AGENT_CONTEXT.md` should describe current AI operating context, not future feature planning.
- Rule: `docs/PLAYBOOK_DEV_WORKFLOW.md` should describe development process, not act as a second roadmap.
- Rule: `docs/index.md` should navigate documentation, not duplicate backlog or roadmap content.
- Pattern: Historical one-off cleanup docs should be archived or removed once governance rules replace them.
- Failure Mode: Docs-audit warning burn-down is faked if warnings are removed by weakening audit rules instead of aligning documents.
