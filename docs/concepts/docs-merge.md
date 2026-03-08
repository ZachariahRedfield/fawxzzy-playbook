# Docs Merge Tool

`scripts/docs-merge.mjs` is a deterministic, offline docs hygiene utility for the Playbook repo.

## Goals

- Scan `docs/**/*.md` and detect stale/redundant content patterns.
- Identify repeated headings across files.
- Identify exact duplicate blocks (trimmed text match).
- Produce a deterministic report at `docs/archive/REPORT_DOCS_MERGE_2026.md` (historical) and maintain active docs workflow guidance in `docs/commands/docs.md`.
- Apply **SAFE** edits by default (links/stubs, no destructive deletes).

## Usage

```bash
pnpm docs:merge -- --dry-run
pnpm docs:merge -- --apply
pnpm docs:merge -- --apply --prune
```

## Flags

- `--dry-run` (default unless `--apply` is set)
  - Writes the report only.
  - Does not edit markdown files.
- `--apply`
  - Writes safe edits and updates report.
- `--prune` (default: false)
  - Only active with `--apply`.
  - Allows duplicate block replacement when the duplicate text is an exact match.
  - A canonical stub/link is inserted in the edited file.

## SAFE mode behavior

When applying without `--prune`, the tool:

- adds a canonical pointer for duplicate headings in non-canonical files.
- appends a “see also” pointer next to duplicate blocks.
- keeps original duplicated content in place.

No destructive removals are performed in default mode.

## Determinism

The tool keeps output stable by:

- sorting scanned files lexicographically.
- sorting duplicate groups and occurrences by file path + line.
- selecting canonical sources using first lexicographic occurrence.

## Notes

- The report is regenerated on each run.
- Excluded directories: `node_modules`, `dist`, `.playbook`, `.git`.
- The tool is mechanical/heuristic only and does not depend on LLM services.
