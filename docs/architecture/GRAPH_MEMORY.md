# Graph Memory Architecture

## Purpose

Playbook memory should be modeled as a deterministic heterogeneous graph.

Durable memory is not a bag of notes; it is a typed graph with preserved lineage and controlled contraction.

This document defines the structure layer only. It introduces graph-memory scaffolding without changing runtime behavior.

## Memory model

### Vertices

Vertices are memory-bearing entities:

- `RunCycle`
- `Artifact`
- `Zettel`
- `PatternCard`
- `Contract`
- `Subject`
- `Decision`

### Edges

Edges are typed relations between vertices:

- `PRODUCED`
- `CITES`
- `SUPPORTS`
- `DERIVES`
- `SIMILAR_TO`
- `MEMBER_OF`
- `PROMOTES_TO`
- `VIOLATES`
- `SUPERSEDES`
- `APPLIES_TO`

### Hypergraph-style relation modeling

Playbook uses a simple graph as the base representation.

When one relation needs more than two participants, model it as a relation vertex (hyperedge-style node) with:

- `relationKind`
- `participantIds[]`
- `evidenceRefs[]`
- `originCycleId`

This preserves deterministic storage while allowing multi-entity evidence/event relations.

## Contraction and attractors

- Contraction is memory compaction from many evidence vertices into fewer stable attractor vertices.
- Pattern cards are soft attractors.
- Contracts are hard attractors.

Why this matters:

- Accumulation is not compression. More notes can increase retrieval burden and entropy.
- Contraction must preserve lineage so every promoted claim remains traceable to evidence.
- Contracts are hard attractors because they carry governance invariants and policy force.

## Deterministic critical path vs exploratory analysis

Deterministic production grouping should be favored in the critical path:

- deterministic grouping: typed edges, reproducible thresholds, stable outputs
- deterministic WCC-style grouping: production-safe component formation

Stochastic clustering is exploratory only:

- offline Louvain/Leiden may be used for research and diagnostics
- exploratory clustering must not gate production promotion/contract decisions

## Pipeline model

```text
raw artifacts
-> zettels
-> graph edges
-> deterministic groups
-> pattern cards
-> contracts
```

## Temperature model

```text
hot graph -> warm graph -> cold graph
```

- hot graph = current cycle working set
- warm graph = unresolved/converging memory
- cold graph = promoted doctrine/contracts

## Rule / Pattern / Failure Mode

Rule:
Durable memory is not a bag of notes; it is a typed graph with preserved lineage and controlled contraction.

Pattern:
Memory compression in Playbook should happen through deterministic graph contraction from many evidence nodes into fewer stable attractor nodes.

Failure Mode:
If every zettel becomes a permanent vertex and nothing contracts, the graph becomes infinite in intake but useless in working memory.
