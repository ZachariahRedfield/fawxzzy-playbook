# Testing

## 1) Testing philosophy

Testing is part of Playbook's product contract:

- New commands should ship with tests.
- Coverage must validate behavior and CLI-facing contracts.
- Determinism and JSON stability are first-class test targets.

## 2) Test layers

### Unit tests

Focus:

- Engine logic.
- Rule behavior.
- Deterministic task generation.

### CLI tests

Focus:

- Text output rendering.
- Exit behavior.
- JSON output contract shape.

### Integration tests

Focus:

- `verify` → `plan` pipeline behavior.
- Rule registry loading and execution.

### Smoke tests

Focus:

- Packed/installed CLI execution.
- End-to-end confidence that Playbook works as a package, not only from source.

## 3) JSON contract stability

JSON output is a public interface. Its shape should remain stable across versions so CI systems, AI agents, and automation pipelines can safely consume results.

## 4) CI expectations

Typical checks:

- `pnpm build`
- `pnpm test`
- `pnpm lint`

CI failures should block merges when core behavior or contracts break.
