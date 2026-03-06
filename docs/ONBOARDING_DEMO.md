# Demo and Onboarding

## Purpose

`playbook-demo` is the planned fast onboarding repository for first-run adoption.

Goal: let developers run Playbook (`analyze` and `verify`) immediately and see useful governance output without repository setup work.

## Adoption role

The demo repo is part of product adoption strategy:

- shortens time-to-value for new users
- provides a stable walkthrough for docs/videos/live demos
- gives contributors and AI agents a known-good environment for examples

## Current status

This is roadmap work (future-state). Use this repository's local quickstart/docs for current onboarding until `playbook-demo` is published as a maintained first-class demo surface.

## Rule: Demo Terminology Sync

Whenever the main product changes command framing, output language, or architecture positioning, revalidate the demo repository in the same phase or immediately after.

The demo README, scenario docs, and command wording should not lag behind the core product narrative.

## Pattern: demo as narrative surface

The demo repository is not just a testbed.

It is the fastest explanation of what Playbook is.

## Pattern: Product Demo Contract

A good demo repo should provide a stable before/after story:

- known initial findings
- clear educational meaning
- deterministic remediation
- verifiable clean end state

This keeps the demo useful as both an onboarding surface and a governance learning artifact.

## Rule: optimize for product clarity over command breadth

The demo repo is the product perception layer.

Design decisions in `playbook-demo` should prioritize explaining Playbook's value clearly, even if that means covering fewer commands in a single walkthrough.

## Pattern: analyze → verify → plan must align on the same issues

The core demo narrative should be intentionally sequenced:

1. `analyze` highlights the expected architectural drift signals.
2. `verify` confirms governance failures on the same drift themes.
3. `plan` proposes deterministic remediation for those exact items.

All three steps should describe the same small set of intentional issues so users can trust the flow from diagnosis to action.

## Pattern: model realistic architectural drift

Intentional demo issues should resemble real repository drift (for example, docs lagging after architectural changes), not random or artificial breakage.

This keeps outputs educational, credible, and easy to transfer to real repos.

## Failure mode: too many intentional issues create noise

If the demo contains too many seeded problems, outputs from `analyze`, `verify`, and `plan` feel noisy and less trustworthy.

Keep issue count low and legible so command output remains screenshot-friendly for README/docs and easy to follow in live demos.
