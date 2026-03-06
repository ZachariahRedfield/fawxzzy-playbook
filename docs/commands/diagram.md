# `playbook diagram`

## What it does
Generates deterministic architecture Mermaid diagrams for dependency and/or repository structure views.

## Common usage
- `playbook diagram`
- `playbook diagram --repo . --out docs/ARCHITECTURE_DIAGRAMS.md`
- `playbook diagram --deps`
- `playbook diagram --structure`

## Notable flags
- `--repo <path>`: repository root to analyze (default `.`).
- `--out <path>`: output markdown file (default `docs/ARCHITECTURE_DIAGRAMS.md`).
- `--deps`: include dependency diagram only.
- `--structure`: include structure diagram only.
