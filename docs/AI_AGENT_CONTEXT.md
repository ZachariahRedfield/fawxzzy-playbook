# AI Agent Context

## Use diagrams before structural changes

When changing package layout or cross-package dependencies:

1. Run `pnpm -r build && node packages/cli/dist/main.js diagram --repo . --out docs/ARCHITECTURE_DIAGRAMS.md` for repo-internal execution.
2. Review `Structure` to understand folder/workspace containment.
3. Review `Dependencies` to avoid introducing unintended couplings.
4. Regenerate diagrams after architecture updates and commit the updated markdown.

This keeps architecture reasoning explicit and reproducible for future agents.

## Release & Distribution

### Why `playbook` (unscoped) is not the npx target

- WHAT: Treat unscoped `playbook` as unavailable for onboarding commands.
- WHY: The unscoped npm package name is already taken, so `npx playbook ...` cannot be the reliable install-free path.

### Preferred onboarding commands

- WHAT: Primary command: `npx --yes @fawxzzy/playbook analyze`.
- WHY: Uses the scoped package we control and works as a copy/paste quick start.

- WHAT: Optional compatibility command: `npx --yes -p @fawxzzy/playbook playbook analyze`.
- WHY: Gives teams an alternate invocation form when they prefer explicit package preinstall semantics.

### Publishing notes

- WHAT: Publish scoped packages with explicit public access (`npm publish --access public`).
- WHY: Scoped npm packages default to private visibility and will not work for public `npx` onboarding unless published as public.

- WHAT: Do a manual first publish, then automate via a tag-triggered GitHub workflow.
- WHY: Validates package metadata and distribution behavior once before CI automation takes ownership.


## Product state anchoring

Rule: **Product State Must Be Anchored**.

Pattern: **AI Anchor Drift**.

Whenever command/workflow state changes, update:

- `README.md`
- `docs/PLAYBOOK_PRODUCT_ROADMAP.md`
- command reference docs
- demo docs/contracts
- `docs/CHANGELOG.md`

Current product-facing command/artifact surface:

- `analyze`
- `verify`
- `rules`
- `doctor`
- `diagram`
- `plan`
- `apply`
- `playbook-demo` (via `playbook demo`)

This document is runtime context only; roadmap planning belongs in `docs/PLAYBOOK_IMPROVEMENTS.md` and `docs/PLAYBOOK_PRODUCT_ROADMAP.md`.

If docs disagree with implementation, treat code as source of truth and realign docs.


## Internal CI command rule

- Rule: Repo-internal CI must execute the built CLI directly, not through `npx`.
- Pattern: Separate internal CLI execution (`node packages/cli/dist/main.js ...`) from consumer-install execution (`npx --yes @fawxzzy/playbook ...`).
- Failure Mode: `npx could not determine executable to run` indicates package/bin resolution failure, not necessarily a command implementation bug.
