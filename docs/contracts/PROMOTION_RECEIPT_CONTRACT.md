# Promotion Receipt Contract

`packages/contracts/src/promotion-receipt.schema.json` defines the machine-readable receipt emitted whenever `pnpm playbook promote story ...` or `pnpm playbook promote pattern ...` mutates canonical knowledge or attempts mutation.

## Rule

- Promotion must emit a deterministic receipt whenever canonical knowledge is mutated or mutation is attempted.

## Pattern

- Promotion should be inspectable with the same rigor as execution.

## Failure Mode

- Knowledge writes without receipts create invisible drift and undermine trust in promotion history.

## Contract fields

- `promotion_kind`: `story | pattern`.
- `source_candidate_ref`: canonical candidate ref that initiated the attempt.
- `source_fingerprint`: deterministic fingerprint of the source candidate content.
- `target_artifact_path`: canonical artifact path targeted by the promotion attempt.
- `target_id`: canonical story/pattern id targeted by the attempt.
- `before_fingerprint`: target fingerprint before the attempt, or `null` when the target did not exist.
- `after_fingerprint`: target fingerprint after the attempt, or the preserved fingerprint for conflicts/noops.
- `outcome`: `promoted | noop | conflict`.
- `generated_at`: deterministic emission timestamp for the attempt receipt.

## Artifact locations

- Repo-scoped story promotion receipts: `.playbook/promotion-receipts/story.latest.json`
- Playbook-home pattern promotion receipts: `.playbook/promotion-receipts/pattern.latest.json`

These receipts are written with the same deterministic serializer and staged-write discipline used by other durable Playbook artifacts, and they are inspectable from Observer's existing artifact viewer.
