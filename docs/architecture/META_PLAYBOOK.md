# Meta-Playbook Introspection

## Purpose

Meta-Playbook lets Playbook analyze its own artifact stream to produce system-level findings, proposals, and telemetry.

The meta layer is observational and advisory only.

## Artifact scope

Meta analysis reads the deterministic lifecycle artifacts:

- run cycles
- graph snapshots
- deterministic graph groups
- candidate patterns
- draft pattern cards
- promoted pattern cards
- promotion decisions
- contract versions and contract proposals

Meta artifacts are emitted under:

- `.playbook/meta/findings/meta-findings.json`
- `.playbook/meta/findings/meta-patterns.json`
- `.playbook/meta/proposals/meta-proposals.json`
- `.playbook/meta/telemetry/meta-telemetry.json`

## System findings

Current findings cover:

- promotion latency
- duplicate pattern topology
- draft backlog pressure
- contract mutation frequency
- entropy trend

These findings must reference source artifacts so reviewers can inspect the evidence path deterministically.

## Proposal requirements

Meta proposals must include:

- source finding id
- evidence artifacts
- supporting metrics

Proposals are always draft advisory artifacts and never mutate doctrine automatically.

## Doctrine safety boundary

Rule:
Meta-Playbook may observe and propose improvements but cannot mutate doctrine automatically.

Pattern:
Self-analysis allows the reasoning engine to improve its learning process.

Failure Mode:
If meta findings mutate process rules automatically, governance stability collapses.

## Governance behavior

Meta findings may create improvement proposals under `.playbook/meta/proposals/`.

Those proposals are drafts and must flow through normal review and governance commands before any doctrine change can occur.

The meta layer never writes to pattern-card artifacts or contract artifacts directly.
