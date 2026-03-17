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
- Example for `v0.3.77`: `playbook-cli-0.3.77.tgz`
- Release URL shape: `https://github.com/fawxzzy/playbook/releases/download/v<version>/playbook-cli-<version>.tgz`

The workflow enforces `tag version == packages/cli-wrapper package.json version` before uploading the tarball so pinned fallback URLs remain immutable and real.

## 4) Push the release tag

Create and push a git tag that matches the released version:

```bash
git tag v0.1.1
git push origin v0.1.1
```
