import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReleasePlanFromInputs } from '../src/release/index.js';

const createFixtureRepo = (): string => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-release-plan-'));
  fs.mkdirSync(path.join(repoRoot, '.playbook'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'packages', 'alpha', 'src'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'packages', 'beta', 'src'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'docs', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'packages', 'alpha', 'package.json'), JSON.stringify({ name: '@scope/alpha', version: '1.2.3' }, null, 2));
  fs.writeFileSync(path.join(repoRoot, 'packages', 'beta', 'package.json'), JSON.stringify({ name: '@scope/beta', version: '1.2.3' }, null, 2));
  fs.writeFileSync(path.join(repoRoot, '.playbook', 'version-policy.json'), JSON.stringify({
    schemaVersion: '1.0',
    kind: 'playbook-version-policy',
    breakingChangeMarkers: ['BREAKING CHANGE'],
    versionGroups: [{ name: 'lockstep', packages: ['@scope/alpha', '@scope/beta'] }]
  }, null, 2));
  return repoRoot;
};

const buildPlan = (repoRoot: string, changedFiles: Array<{ path: string; status: string }>) =>
  buildReleasePlanFromInputs(repoRoot, {
    generatedAt: '2026-03-22T00:00:00.000Z',
    baseRef: 'origin/main',
    baseSha: 'base',
    headSha: 'head',
    changedFiles
  });

describe('buildReleasePlanFromInputs', () => {
  it('is deterministic for the same input diff', () => {
    const repoRoot = createFixtureRepo();
    fs.writeFileSync(path.join(repoRoot, 'packages', 'alpha', 'src', 'feature.ts'), 'export const value = 1;\n');

    const changedFiles = [{ path: 'packages/alpha/src/feature.ts', status: 'A' }];
    expect(buildPlan(repoRoot, changedFiles)).toEqual(buildPlan(repoRoot, changedFiles));
  });

  it('keeps lockstep version groups aligned deterministically', () => {
    const repoRoot = createFixtureRepo();
    fs.writeFileSync(path.join(repoRoot, 'packages', 'alpha', 'src', 'feature.ts'), 'export const value = 1;\n');

    const plan = buildPlan(repoRoot, [{ path: 'packages/alpha/src/feature.ts', status: 'A' }]);
    expect(plan.summary.recommendedBump).toBe('patch');
    expect(plan.versionGroups[0]?.recommendedBump).toBe('patch');
    expect(plan.packages.map((pkg) => pkg.recommendedBump)).toEqual(['patch', 'patch']);
  });

  it('treats public contract expansion as a minor bump', () => {
    const repoRoot = createFixtureRepo();
    fs.writeFileSync(path.join(repoRoot, 'packages', 'contracts-note.txt'), 'schema changed\n');

    const plan = buildPlan(repoRoot, [{ path: 'packages/contracts/src/new-contract.schema.json', status: 'A' }]);
    expect(plan.summary.recommendedBump).toBe('minor');
    expect(plan.diff.changedFiles[0]?.reasons).toContain('stable contract/schema surface changed');
  });

  it('treats docs-only changes as none', () => {
    const repoRoot = createFixtureRepo();
    fs.writeFileSync(path.join(repoRoot, 'docs', 'commands', 'release.md'), '# release\n');

    const plan = buildPlan(repoRoot, [{ path: 'docs/commands/release.md', status: 'M' }]);
    expect(plan.summary.recommendedBump).toBe('none');
    expect(plan.diff.changedFiles[0]?.reasons).toContain('docs/tests/CI-only surface changed');
  });

  it('requires an explicit breaking marker for a major bump', () => {
    const repoRoot = createFixtureRepo();
    fs.writeFileSync(path.join(repoRoot, 'packages', 'alpha', 'src', 'breaking.ts'), '// BREAKING CHANGE\nexport const value = 2;\n');

    const plan = buildPlan(repoRoot, [{ path: 'packages/alpha/src/breaking.ts', status: 'A' }]);
    expect(plan.summary.recommendedBump).toBe('major');
    expect(plan.diff.changedFiles[0]?.reasons[0]).toContain('explicit breaking marker detected');
  });
});
