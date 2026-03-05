# AI Agent Context

## Use diagrams before structural changes

When changing package layout or cross-package dependencies:

1. Run `playbook diagram --repo . --out docs/ARCHITECTURE_DIAGRAMS.md`.
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
