# Playbook v0.1.0

Playbook is a lightweight governance CLI that helps teams enforce one practical rule: if code changes, update project notes.

## 2-minute quickstart

```bash
pnpm install
pnpm build
pnpm -C packages/cli playbook init
pnpm -C packages/cli playbook analyze
pnpm -C packages/cli playbook verify
```

## What v0.1.0 enforces

- `verify` checks changed files against policy in `playbook.config.json`.
- Default policy: if app/code paths changed (`src/**`, `app/**`, `server/**`, `supabase/**`), `docs/PLAYBOOK_NOTES.md` must also change.
- CI-friendly output and exit code (`0` pass, `1` fail).

## Example failure output

```text
✖ Verification failed
Base: origin/main (abc123)

[requireNotesOnChanges] Code changes require a notes update.
Evidence: src/foo.ts
Fix: Update docs/PLAYBOOK_NOTES.md with a note describing WHAT changed and WHY.
```

## Templates + CI integration

- `playbook init` scaffolds docs, config, and a GitHub Action template (`.github/workflows/playbook-verify.yml`) for consumer repos.
- This monorepo has its own CI workflow at `.github/workflows/ci.yml`.
