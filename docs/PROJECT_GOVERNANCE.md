# Project Governance

## Toolchain Policy

- pnpm is required for local development and CI workflows.
- `pnpm-lock.yaml` is required, committed, and must not be gitignored.
- `package.json#packageManager` is the authoritative pnpm version source.
- CI may use `pnpm/action-setup` or Corepack, but must not pin a conflicting pnpm version.

## CI Guarantees

- CI uses pnpm and must align provisioning with `packageManager` (via `pnpm/action-setup` and/or Corepack).
- Dependency install is deterministic: `pnpm install --frozen-lockfile` is required.
- Every pull request runs build, tests, and smoke checks via the Playbook CI composite action.

## Verify / Notes on Changes

## Repo-Scoped Roadmap + Story System

For product-oriented consumer repositories, adopt the repo-scoped roadmap system as a docs-first planning contract before introducing heavier automation.

Recommended minimum:

- create `docs/ROADMAP.md`
- create `docs/stories/`
- author one real story from `docs/templates/story.template.md`
- keep roadmap pillars and active stories current enough that PRs can map back to a story

Governance expectations:

- Stories must be independently shippable.
- Stories must define scope and non-goals explicitly.
- Hidden cross-story dependencies are not allowed.
- `pnpm playbook docs audit --json` is the lightweight contract check for repos that opt in.

Keep it lightweight: do not recreate a heavyweight project-management stack inside docs; use stories to clarify product intent and evidence, not to duplicate task trackers.


- `requireNotesOnChanges` enforces that relevant code changes are paired with an update to `docs/PLAYBOOK_NOTES.md`.
- Diff-base selection prefers `origin/main` when available.
- Otherwise, verify uses `merge-base(main, HEAD)`.
- If `merge-base(main, HEAD) == HEAD`, verify falls back to `HEAD~1` to avoid empty diffs after commits on `main`.
- If verify fails, add a clear WHAT/WHY entry to `docs/PLAYBOOK_NOTES.md`, then rerun:

```bash
pnpm smoke
```
