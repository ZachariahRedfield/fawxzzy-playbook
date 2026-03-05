# Releasing Playbook CLI

## 1) Build and test from the monorepo root

```bash
pnpm install
pnpm -r build
pnpm test
```

## 2) Publish from `packages/cli`

```bash
cd packages/cli
npm publish --access public
```

Notes:
- The monorepo root is marked `private: true` and is not publishable.
- The CLI package is published as `@fawxzzy/playbook`.

## 3) Push the release tag

Create and push a git tag that matches the released version:

```bash
git tag v0.1.1
git push origin v0.1.1
```
