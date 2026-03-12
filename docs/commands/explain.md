# `pnpm playbook explain`

Explain deterministic repository intelligence targets from `.playbook/repo-index.json`, `.playbook/repo-graph.json`, and the rule registry.

## Usage

- `pnpm playbook explain PB001`
- `pnpm playbook explain users`
- `pnpm playbook explain workouts`
- `pnpm playbook explain architecture`
- `pnpm playbook explain workouts --json`
- `pnpm playbook explain workouts --with-memory --json`

## Supported target types

- rule ids (for example `PB001`)
- indexed modules (`pnpm playbook query modules`)
- `architecture`

## JSON contract

```json
{
  "command": "explain",
  "target": "workouts",
  "type": "module",
  "explanation": {
    "name": "workouts",
    "responsibilities": [
      "Owns workouts feature behavior and boundaries.",
      "Encapsulates workouts domain logic and module-level policies."
    ],
    "dependencies": [],
    "architecture": "modular-monolith",
    "graphNeighborhood": {
      "node": { "id": "module:workouts", "kind": "module", "name": "workouts" },
      "outgoing": [],
      "incoming": [{ "kind": "contains", "source": "repository:root" }]
    }
  }
}
```

## Memory-aware mode

Use `--with-memory` to add deterministic memory descriptors to explanation payloads without changing legacy output by default.

When enabled, `explanation` may include: `memorySummary`, `memorySources`, `knowledgeHits`, and `recentRelevantEvents`.
