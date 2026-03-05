# AI Agent Context

## Use diagrams before structural changes

When changing package layout or cross-package dependencies:

1. Run `playbook diagram --repo . --out docs/ARCHITECTURE_DIAGRAMS.md`.
2. Review `Structure` to understand folder/workspace containment.
3. Review `Dependencies` to avoid introducing unintended couplings.
4. Regenerate diagrams after architecture updates and commit the updated markdown.

This keeps architecture reasoning explicit and reproducible for future agents.
