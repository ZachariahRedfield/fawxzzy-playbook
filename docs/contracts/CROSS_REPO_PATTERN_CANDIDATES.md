# Cross-Repo Pattern Candidates Contract (v1)

## Purpose

`cross-repo-candidates` defines a deterministic aggregation artifact for pattern candidate evidence observed across multiple repositories.

Artifact path:

- `.playbook/cross-repo-candidates.json`

Cross-repo aggregation is a read-only synthesis of per-repo candidate artifacts and must not mutate any source repository artifacts.

## Aggregation and normalization overview

Aggregation loads each repository's `.playbook/pattern-candidates.json`, normalizes candidate `pattern_family` values to a canonical family key, and then computes cross-repo metrics per normalized family.

Normalization expectations:

- trim surrounding whitespace
- lowercase family names
- collapse whitespace and underscores to `-`
- collapse repeated `-`

This prevents duplicate abstractions caused by stylistic family-name variation (for example `workflow recursion`, `workflow_recursion`, and `Workflow Recursion`).

Aggregate metrics are computed per normalized family:

- `repo_count`: distinct repositories contributing at least one candidate
- `candidate_count`: total candidate observations across repositories
- `mean_confidence`: mean candidate confidence (`0..1`)
- `first_seen`: earliest source artifact timestamp
- `last_seen`: latest source artifact timestamp

Aggregates must be emitted in deterministic lexicographic order by normalized `pattern_family`.

## Rule

Cross-repo learning must aggregate evidence without mutating per-repo artifacts.

## Pattern

Normalize candidate families before computing cross-repo metrics.

## Failure mode

Directly merging candidate IDs across repos causes duplicate abstractions and unstable doctrine proposals.
