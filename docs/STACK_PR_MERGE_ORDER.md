# Stacked PR Merge Order (Merge-Ready)

This sequence prioritizes CI/bootstrap trust restoration before roadmap/docs narrative layers, then phases in hardening and Phase 15 shell documentation.

## Recommended merge order

1. **PR #431 — fix-ci-smoke-harness-for-artifacts-bootstrap**
   - **Dependency reason:** Restores smoke/bootstrap determinism (`scripts/run-tests.mjs`) that downstream PR validation depends on.
   - **Risk notes:** High leverage on CI gating; regressions here can invalidate all later PR signal.

2. **PR #426 — restore-artifact-hygiene-in-.playbook**
   - **Dependency reason:** Normalizes artifact hygiene + ignores before further docs/runtime truth assertions.
   - **Risk notes:** Touches `README.md` and `docs/CHANGELOG.md`; low runtime risk, medium merge-conflict risk with later narrative PRs.

3. **PR #427 — sync-machine-readable-roadmap-to-phase-14**
   - **Dependency reason:** Aligns roadmap contract surfaces to current runtime baseline after CI/hygiene stabilization.
   - **Risk notes:** Overlaps heavily with subsequent roadmap/docs PRs (`docs/PLAYBOOK_PRODUCT_ROADMAP.md`, `docs/roadmap/ROADMAP.json`, `docs/CHANGELOG.md`).

4. **PR #429 — finish-phase-14-knowledge-hardening**
   - **Dependency reason:** Lands Phase 14 test/contract hardening once roadmap metadata reflects expected state.
   - **Risk notes:** Primarily test fixtures/contracts; medium risk of snapshot churn and CLI contract drift.

5. **PR #430 — create-phase-15-architecture-contracts-shell**
   - **Dependency reason:** Introduces initial Phase 15 shell contracts after Phase 14 hardening baseline.
   - **Risk notes:** Documentation-heavy overlap on roadmap files; ensure no regression of shipped/runtime claims.

6. **PR #432 — polish-phase-15-documentation-for-merge-readiness**
   - **Dependency reason:** Follow-up narrative polish to the Phase 15 shell, intended to layer directly on #430.
   - **Risk notes:** High overlap with #430 in identical docs; treat as dependent polish, not independent narrative truth.

## Overlap watchlist

Primary merge-conflict corridors across this stack:

- `docs/PLAYBOOK_PRODUCT_ROADMAP.md`
- `docs/roadmap/ROADMAP.json`
- `docs/CHANGELOG.md`
- `README.md`
- `scripts/run-tests.mjs`
- `packages/cli/test/*`

Conflict resolution policy:

1. Prefer green CI behavior and deterministic smoke/test execution.
2. Preserve canonical doc names and command truth.
3. Ensure roadmap metadata describes shipped runtime truth (not transient stacked state).

## Post-merge verification checklist

Run after each merge (and once at stack tip):

- `pnpm -r build`
- `pnpm test`
- `pnpm verify`
- `node scripts/validate-roadmap-contract.mjs --ci`
- `pnpm playbook docs audit --json`
