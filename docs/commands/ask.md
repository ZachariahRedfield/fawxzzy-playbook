# `pnpm playbook ask`

Answer repository questions from machine-readable repository intelligence.

## Usage

```bash
pnpm playbook ask "where should a new feature live?"
pnpm playbook ask "where should a new feature live?" --repo-context
pnpm playbook ask "what modules are affected by this change?" --diff-context --json
pnpm playbook ask "what should I verify before merge?" --diff-context --mode concise
pnpm playbook ask "where should this live?" --repo-context --with-repo-context-memory
pnpm playbook ask "summarize risk for this diff" --diff-context --with-diff-context-memory
```

## Options

- `--mode <normal|concise|ultra>`: controls answer verbosity.
- `--repo-context`: injects trusted Playbook repository context (`.playbook/repo-index.json`, plus AI contract source metadata).
- `--module <name>`: narrows reasoning to one indexed module.
- `--diff-context`: narrows reasoning to changed files mapped through index intelligence.
- `--base <ref>`: optional base ref when `--diff-context` is enabled.
- `--with-repo-context-memory`: opt in to memory-aware hydration for `--repo-context` prompts.
- `--with-diff-context-memory`: opt in to memory-aware hydration for `--diff-context` prompts.

`--module` and `--diff-context` are mutually exclusive.

## Behavior

Supported repo-context governance questions now also include lightweight product-direction prompts such as:

- `what story should this change belong to?`
- `what pillar does this feature map to?`

These answers rely on the repo-scoped roadmap/story contract documented in `docs/roadmap/REPO_ROADMAP_SYSTEM.md`.


- Uses Playbook-managed intelligence instead of broad repository scanning.
- Returns deterministic answerability state in JSON (`answered-from-trusted-artifact`, `artifact-missing`, `artifact-stale`, or `unsupported-question`).
- Includes provenance descriptors in `context.sources` (for example `repo-index`, `repo-graph`, `module`, `diff`, `docs`, `ai-contract`).
- Memory descriptors (`memorySummary`, `memorySources`, `knowledgeHits`, `recentRelevantEvents`, `memoryKnowledge`) are additive context fields when memory-aware hydration is enabled.

## JSON output highlights

`pnpm playbook ask ... --json` returns:

- `answerability`
- `command`, `question`, `mode`, `modeInstruction`
- `answer`, `reason`
- `repoContext` and `scope`
- `context` including repository summary fields plus `context.sources` provenance metadata
