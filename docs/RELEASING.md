# Releasing Playbook CLI

## 1) Build and test from the monorepo root

```bash
pnpm install
pnpm -r build
pnpm test
```

## 2) Publish from CI on a version tag

Tag pushes (`v*`) trigger `.github/workflows/publish-npm.yml`, which publishes the public Playbook package (`@fawxzzy/playbook`) and the internal runtime distribution set used by the CLI wrapper/fallback path.

## 3) Deterministic fallback artifact on each release

The publish workflow now packs `packages/cli-wrapper` and uploads a deterministic release asset for CI fallback consumers:

- Asset filename: `playbook-cli-<version>.tgz`
- Example for `v0.1.1`: `playbook-cli-0.1.1.tgz`
- Release URL shape: `https://github.com/fawxzzy/playbook/releases/download/v<version>/playbook-cli-<version>.tgz`

The workflow enforces `tag version == packages/cli-wrapper package.json version` before uploading the tarball so pinned fallback URLs remain immutable and real.

## 4) Consumer pinning contract (Fawxzzy Fitness)

Consumer repositories must pin `PLAYBOOK_OFFICIAL_FALLBACK_SPEC` to the exact deterministic URL:

```bash
PLAYBOOK_OFFICIAL_FALLBACK_SPEC=@https://github.com/fawxzzy/playbook/releases/download/v0.1.1/playbook-cli-0.1.1.tgz
```

This keeps producer (release asset) and consumer (fallback URL) ownership boundaries explicit and prevents URL/version/filename drift.

## 5) End-to-end fallback proof command

From this repository, run:

```bash
pnpm release:fallback:proof --version 0.1.1 --json
```

Optional consumer smoke validation (for real downstream proof):

```bash
pnpm release:fallback:proof --version 0.1.1 --consumer-repo /path/to/FawxzzyFitness --json
```

When `--consumer-repo` is provided, the command performs the clean-environment sequence:

1. `npm install`
2. package acquisition attempt (intentional miss)
3. fallback acquisition from the published tarball URL
4. canonical ladder (`verify -> plan -> apply`)
5. required artifact assertions (`.playbook/findings.json`, `.playbook/plan.json`, `.playbook/repo-graph.json`, `.playbook/last-run.json`)

## 5.1) Operational proof status tracking (required)

Record each real-network proof outcome in release notes/changelog with:

- producer proof result (`release asset fetch`, `tar integrity`, `canonical filename`)
- consumer proof result against Fawxzzy Fitness (`npm install`, intentional package miss, fallback acquisition, canonical ladder, artifact assertions)
- explicit drift callout when either side fails (producer or consumer)

Fallback is only considered operationally proven when both producer and consumer checks succeed in a network-capable environment.

## 6) Push the release tag

Create and push a git tag that matches the released version:

```bash
git tag v0.1.1
git push origin v0.1.1
```
