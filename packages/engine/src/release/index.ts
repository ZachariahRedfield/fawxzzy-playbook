import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveScmDiffBase } from '../git/context.js';

export type ReleaseBump = 'none' | 'patch' | 'minor' | 'major';

type VersionPolicy = {
  schemaVersion: '1.0';
  kind: 'playbook-version-policy';
  breakingChangeMarkers: string[];
  versionGroups: Array<{
    name: string;
    packages: string[];
  }>;
};

type ChangedFileEvidence = {
  path: string;
  status: string;
  bump: ReleaseBump;
  reasons: string[];
};

type WorkspacePackage = {
  name: string;
  path: string;
  currentVersion: string;
  versionGroup: string | null;
};

export type ReleasePlan = {
  schemaVersion: '1.0';
  kind: 'playbook-release-plan';
  generatedAt: string;
  policy: {
    path: string;
    breakingChangeMarkers: string[];
    versionGroups: Array<{ name: string; packages: string[] }>;
  };
  diff: {
    baseRef: string;
    baseSha: string;
    headSha: string;
    changedFiles: ChangedFileEvidence[];
  };
  summary: {
    recommendedBump: ReleaseBump;
    reasons: string[];
  };
  packages: Array<{
    name: string;
    path: string;
    currentVersion: string;
    recommendedBump: ReleaseBump;
    versionGroup: string | null;
    reasons: string[];
    evidence: ChangedFileEvidence[];
  }>;
  versionGroups: Array<{
    name: string;
    packages: string[];
    recommendedBump: ReleaseBump;
    reasons: string[];
  }>;
};

const VERSION_POLICY_PATH = '.playbook/version-policy.json';
const DEFAULT_BREAKING_MARKERS = ['BREAKING CHANGE', 'PLAYBOOK_BREAKING_CHANGE'];
const bumpRank: Record<ReleaseBump, number> = { none: 0, patch: 1, minor: 2, major: 3 };

const compareBumps = (left: ReleaseBump, right: ReleaseBump): ReleaseBump =>
  bumpRank[left] >= bumpRank[right] ? left : right;

const uniqueSorted = (values: string[]): string[] => Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;

const listWorkspacePackageJsonPaths = (repoRoot: string): string[] => {
  const packagesDir = path.join(repoRoot, 'packages');
  if (!fs.existsSync(packagesDir)) {
    return [];
  }

  return fs.readdirSync(packagesDir)
    .map((entry) => path.join(packagesDir, entry, 'package.json'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort((left, right) => left.localeCompare(right));
};

const readVersionPolicy = (repoRoot: string): VersionPolicy => {
  const absolutePath = path.join(repoRoot, VERSION_POLICY_PATH);
  if (!fs.existsSync(absolutePath)) {
    return {
      schemaVersion: '1.0',
      kind: 'playbook-version-policy',
      breakingChangeMarkers: [...DEFAULT_BREAKING_MARKERS],
      versionGroups: []
    };
  }

  const parsed = readJson<VersionPolicy>(absolutePath);
  return {
    schemaVersion: '1.0',
    kind: 'playbook-version-policy',
    breakingChangeMarkers: uniqueSorted(parsed.breakingChangeMarkers ?? DEFAULT_BREAKING_MARKERS),
    versionGroups: [...(parsed.versionGroups ?? [])]
      .map((group) => ({ name: group.name, packages: uniqueSorted(group.packages) }))
      .sort((left, right) => left.name.localeCompare(right.name))
  };
};

const readWorkspacePackages = (repoRoot: string, policy: VersionPolicy): WorkspacePackage[] => {
  const groupByPackage = new Map<string, string>();
  for (const group of policy.versionGroups) {
    for (const packageName of group.packages) {
      groupByPackage.set(packageName, group.name);
    }
  }

  return listWorkspacePackageJsonPaths(repoRoot)
    .map((packageJsonPath) => {
      const parsed = readJson<{ name?: string; version?: string }>(packageJsonPath);
      const relativeDir = path.relative(repoRoot, path.dirname(packageJsonPath)).split(path.sep).join('/');
      return {
        name: String(parsed.name ?? relativeDir),
        path: relativeDir,
        currentVersion: String(parsed.version ?? '0.0.0'),
        versionGroup: groupByPackage.get(String(parsed.name ?? relativeDir)) ?? null
      } satisfies WorkspacePackage;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

const resolveHeadSha = (repoRoot: string): string =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();

const readChangedFiles = (repoRoot: string, baseSha: string): Array<{ path: string; status: string }> => {
  const output = execFileSync('git', ['diff', '--name-status', '--find-renames', baseSha, '--'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/u);
      const filePath = rest.at(-1);
      return filePath ? { path: filePath, status } : null;
    })
    .filter((value): value is { path: string; status: string } => value !== null)
    .sort((left, right) => left.path.localeCompare(right.path));
};

const readFileText = (repoRoot: string, relativePath: string): string => {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
};

const classifyFileChange = (file: { path: string; status: string }, repoRoot: string, policy: VersionPolicy): ChangedFileEvidence => {
  const filePath = file.path;
  const reasons: string[] = [];
  const normalized = filePath.replace(/\\/gu, '/');
  const text = readFileText(repoRoot, normalized);

  const matchingMarkers = policy.breakingChangeMarkers.filter((marker) => text.includes(marker)).sort((left, right) => left.localeCompare(right));
  if (matchingMarkers.length > 0) {
    reasons.push(`explicit breaking marker detected (${matchingMarkers.join(', ')})`);
    return { path: normalized, status: file.status, bump: 'major', reasons };
  }

  const docsOnly = normalized.startsWith('docs/')
    || normalized.startsWith('tests/')
    || normalized.startsWith('.github/')
    || normalized === 'README.md'
    || normalized.endsWith('.md')
    || normalized.includes('.test.')
    || normalized.includes('.spec.')
    || normalized.includes('/__tests__/');

  if (docsOnly) {
    reasons.push('docs/tests/CI-only surface changed');
    return { path: normalized, status: file.status, bump: 'none', reasons };
  }

  if (normalized === 'packages/cli/src/lib/commandMetadata.ts' || normalized.startsWith('packages/cli/src/commands/')) {
    reasons.push('command surface changed');
    return { path: normalized, status: file.status, bump: 'minor', reasons };
  }

  if (normalized.startsWith('packages/contracts/src/') || normalized === '.playbook/version-policy.json') {
    reasons.push('stable contract/schema surface changed');
    return { path: normalized, status: file.status, bump: 'minor', reasons };
  }

  if (normalized === 'packages/engine/src/index.ts' || normalized === 'packages/contracts/src/index.ts') {
    reasons.push('public export surface changed');
    return { path: normalized, status: file.status, bump: 'minor', reasons };
  }

  if (normalized.includes('/verify/') || normalized.endsWith('/rules.ts') || normalized.endsWith('/rules.js')) {
    reasons.push('rule surface changed');
    return { path: normalized, status: file.status, bump: 'minor', reasons };
  }

  if (normalized.startsWith('packages/') && normalized.includes('/src/')) {
    reasons.push('shipped internal code changed');
    return { path: normalized, status: file.status, bump: 'patch', reasons };
  }

  reasons.push('non-shipping repository change');
  return { path: normalized, status: file.status, bump: 'none', reasons };
};

const buildPackageEvidence = (workspacePackage: WorkspacePackage, changedFiles: ChangedFileEvidence[]): ChangedFileEvidence[] =>
  changedFiles.filter((file) => file.path === `${workspacePackage.path}/package.json` || file.path.startsWith(`${workspacePackage.path}/`));

export const buildReleasePlanFromInputs = (
  repoRoot: string,
  inputs: {
    generatedAt: string;
    baseRef: string;
    baseSha: string;
    headSha: string;
    policy?: VersionPolicy;
    changedFiles: Array<{ path: string; status: string }>;
  }
): ReleasePlan => {
  const policy = inputs.policy ?? readVersionPolicy(repoRoot);
  const workspacePackages = readWorkspacePackages(repoRoot, policy);
  const changedFiles = inputs.changedFiles.map((file) => classifyFileChange(file, repoRoot, policy));

  const packagePlans = workspacePackages.map((workspacePackage) => {
    const evidence = buildPackageEvidence(workspacePackage, changedFiles);
    let recommendedBump: ReleaseBump = 'none';
    for (const file of evidence) {
      recommendedBump = compareBumps(recommendedBump, file.bump);
    }

    const reasons = uniqueSorted(evidence.flatMap((file) => file.reasons));
    return {
      name: workspacePackage.name,
      path: workspacePackage.path,
      currentVersion: workspacePackage.currentVersion,
      recommendedBump,
      versionGroup: workspacePackage.versionGroup,
      reasons,
      evidence
    };
  });

  const versionGroups = policy.versionGroups.map((group) => {
    const matchingPackages = packagePlans.filter((entry) => group.packages.includes(entry.name));
    let recommendedBump: ReleaseBump = 'none';
    for (const pkg of matchingPackages) {
      recommendedBump = compareBumps(recommendedBump, pkg.recommendedBump);
    }
    const reasons = uniqueSorted(matchingPackages.flatMap((pkg) => pkg.reasons));
    return { name: group.name, packages: [...group.packages], recommendedBump, reasons };
  });

  const groupBumpByName = new Map(versionGroups.map((group) => [group.name, group.recommendedBump] as const));
  const normalizedPackages = packagePlans
    .map((entry) => ({
      ...entry,
      recommendedBump: entry.versionGroup ? (groupBumpByName.get(entry.versionGroup) ?? entry.recommendedBump) : entry.recommendedBump
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  let recommendedBump: ReleaseBump = 'none';
  for (const group of versionGroups) {
    recommendedBump = compareBumps(recommendedBump, group.recommendedBump);
  }
  for (const pkg of normalizedPackages) {
    recommendedBump = compareBumps(recommendedBump, pkg.recommendedBump);
  }

  const summaryReasons = uniqueSorted([
    ...changedFiles.filter((file) => file.bump === recommendedBump).flatMap((file) => file.reasons),
    ...versionGroups.filter((group) => group.recommendedBump === recommendedBump).flatMap((group) => group.reasons)
  ]);

  return {
    schemaVersion: '1.0',
    kind: 'playbook-release-plan',
    generatedAt: inputs.generatedAt,
    policy: {
      path: VERSION_POLICY_PATH,
      breakingChangeMarkers: [...policy.breakingChangeMarkers],
      versionGroups: policy.versionGroups.map((group) => ({ name: group.name, packages: [...group.packages] }))
    },
    diff: {
      baseRef: inputs.baseRef,
      baseSha: inputs.baseSha,
      headSha: inputs.headSha,
      changedFiles
    },
    summary: {
      recommendedBump,
      reasons: summaryReasons
    },
    packages: normalizedPackages,
    versionGroups
  };
};

export const buildReleasePlan = (repoRoot: string, options: { baseRef?: string; generatedAt?: string } = {}): ReleasePlan => {
  const diffBase = resolveScmDiffBase(repoRoot, { baseRef: options.baseRef, commandName: 'playbook release plan' });
  const headSha = resolveHeadSha(repoRoot);
  const changedFiles = readChangedFiles(repoRoot, diffBase.baseSha);
  return buildReleasePlanFromInputs(repoRoot, {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    baseRef: diffBase.baseRef,
    baseSha: diffBase.baseSha,
    headSha,
    changedFiles
  });
};
