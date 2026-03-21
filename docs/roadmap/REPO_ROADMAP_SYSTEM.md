# Repo-Scoped Roadmap + Story System

This document defines the lightweight documentation contract Playbook recommends for any consumer repository that wants product direction to stay explicit, shippable, and easy to map back to pull requests.

## Purpose

The repo-scoped roadmap system is intentionally docs-first:

- no runtime dependency is required
- the system is optional, but strongly recommended for active product repos
- Playbook should validate the contract through existing commands before introducing heavier workflow tooling

Pattern: Product direction should be expressed as small, shippable stories rather than large, vague initiatives.
Rule: Systems are adopted as documentation contracts before becoming enforced tooling.
Failure Mode: Introducing workflow tooling before teams have consistent conceptual usage leads to abandonment.

## Concepts

### Roadmap

A **roadmap** is the repo-local product-direction document that defines the major themes or pillars a team is actively investing in.

Roadmap responsibilities:

- define the current pillars/themes
- show the active stories attached to those pillars
- provide lightweight ordering and priority
- keep product intent visible without becoming a second task tracker

### Story

A **story** is the primary planning unit for product delivery.

A story is a vertical slice of user-visible change that can be shipped independently and evidenced clearly.

Story responsibilities:

- describe the outcome the product gains
- define scope and non-goals explicitly
- identify affected surfaces
- provide completion criteria and evidence

### Task

A **task** is a PR-sized implementation unit that helps deliver a story.

Tasks should stay subordinate to the story rather than becoming the canonical planning surface.

## Relationship model

```text
Roadmap -> Stories -> PRs
```

- roadmap pillars organize direction
- stories organize independently shippable outcomes
- PRs deliver one or more tasks against a single story whenever possible

## Rules

- Stories must be independently shippable.
- Stories must declare scope and non-goals.
- Stories must not hide cross-story dependencies.
- PRs should map cleanly back to one story whenever practical.
- If a change does not map to an existing story, create or refine the story boundary before implementation.

## Canonical file structure

```text
docs/
  ROADMAP.md
  stories/
    <STORY_ID>.md
```

Example:

```text
docs/stories/UI-001-screen-normalization.md
```

## `docs/ROADMAP.md` contract

`docs/ROADMAP.md` is the repo-scoped roadmap entrypoint.

Recommended structure:

```md
# Product Roadmap

## Pillars
- Workout Execution
- Routine Management
- UI Normalization

## Active Stories
- UI-001 – Screen normalization (in-progress)
- WORKOUT-001 – Start workout flow (proposed)

## Priority Order
1. UI-001 – Screen normalization
2. WORKOUT-001 – Start workout flow
```
```

Minimum required sections for validation:

- `## Pillars`
- `## Active Stories`

## Story contract

Each story document should follow this doc-based contract:

```md
# <ID> – <Title>

## Status
proposed | in-progress | complete

## Pillar
<roadmap pillar>

## Outcome
<what changes in the product>

## Scope
<what is included>

## Non-Goals
<what is explicitly excluded>

## Surfaces
<screens/components affected>

## Dependencies
<optional>

## Done When
<clear completion criteria>

## Evidence
<PRs / screenshots / metrics>
```

Validation requires each story file to include all of the sections above.

## Adoption guidance

Start as lightly as possible:

1. create `docs/ROADMAP.md`
2. define 2-5 pillars
3. create one real story in `docs/stories/`
4. map PRs to that story until the workflow feels natural

Keep it lightweight:

- do not mirror your issue tracker line-by-line
- avoid turning stories into giant initiative dumps
- prefer a few active stories over a long stale backlog
- use evidence links instead of long execution narratives

## Current Playbook integration

The initial integration is intentionally light-touch:

- `pnpm playbook docs audit --json` validates the presence and structure of roadmap/story docs when a repo opts into them
- `pnpm playbook ask ... --repo-context` can answer story/pillar mapping questions using this contract
- no new command surface is required for the first phase

## Future direction

This contract creates the foundation for later phases such as:

- richer `playbook story` alignment with docs-first story sources
- future repo story inventory/reporting surfaces
- cross-repo story learning once conceptual usage is stable
