import fs from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import type { DependencyModel, DiagramOptions, WorkspaceNode } from './types.js';
import { toPosixPath } from '../util/paths.js';

const DEFAULT_EXCLUDES = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.next/**'];

const sortUnique = (values: string[]): string[] => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

const readJson = <T>(filePath: string): T | null => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
};

type RootPackageJson = {
  workspaces?: string[] | { packages?: string[] };
};

type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const collectWorkspacePatterns = (root: string): string[] => {
  const rootPkg = readJson<RootPackageJson>(path.join(root, 'package.json'));
  const fromPackageJson = Array.isArray(rootPkg?.workspaces)
    ? rootPkg.workspaces
    : rootPkg?.workspaces?.packages ?? [];

  const workspaceYaml = path.join(root, 'pnpm-workspace.yaml');
  let fromPnpm: string[] = [];
  if (fs.existsSync(workspaceYaml)) {
    const content = fs.readFileSync(workspaceYaml, 'utf8');
    fromPnpm = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.replace(/^-\s*/, '').replace(/^['\"]|['\"]$/g, ''));
  }

  return sortUnique([...fromPackageJson, ...fromPnpm]);
};

const expandWorkspacePattern = (root: string, pattern: string, excludes: string[]): string[] => {
  const normalized = toPosixPath(pattern).replace(/\/\*\*$/, '').replace(/\*$/, '');
  const baseDir = path.join(root, normalized);
  if (!fs.existsSync(baseDir)) return [];

  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => toPosixPath(path.join(normalized, entry.name)));

  return entries.filter((entryPath) => {
    if (excludes.some((glob) => minimatch(entryPath, glob, { dot: true }) || minimatch(`${entryPath}/`, glob, { dot: true }))) return false;
    return fs.existsSync(path.join(root, entryPath, 'package.json'));
  });
};

export const discoverWorkspaces = (root: string, options: DiagramOptions = {}): WorkspaceNode[] => {
  const excludes = options.excludeGlobs ?? DEFAULT_EXCLUDES;
  const patterns = collectWorkspacePatterns(root);

  const workspacePaths = sortUnique(
    patterns.flatMap((pattern) => {
      if (pattern.includes('*')) return expandWorkspacePattern(root, pattern, excludes);
      return fs.existsSync(path.join(root, pattern, 'package.json')) ? [toPosixPath(pattern)] : [];
    })
  );

  return workspacePaths.map((workspacePath) => {
    const pkg = readJson<PackageJson>(path.join(root, workspacePath, 'package.json'));
    return {
      path: workspacePath,
      name: pkg?.name ?? workspacePath
    };
  });
};

export const scanWorkspaceDeps = (root: string, options: DiagramOptions = {}): DependencyModel => {
  const workspaces = discoverWorkspaces(root, options);
  const nameByPath = new Map(workspaces.map((workspace) => [workspace.path, workspace.name]));
  const internalNames = new Set(workspaces.map((workspace) => workspace.name));

  const edges = sortUnique(
    workspaces.flatMap((workspace) => {
      const pkg = readJson<PackageJson>(path.join(root, workspace.path, 'package.json'));
      if (!pkg) return [];
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
        ...(pkg.peerDependencies ?? {})
      };

      return Object.keys(deps)
        .filter((depName) => internalNames.has(depName))
        .map((depName) => `${workspace.name}->${depName}`);
    })
  ).map((edge) => {
    const [from, to] = edge.split('->');
    return { from, to };
  });

  return {
    workspaces: workspaces
      .map((workspace) => ({ name: nameByPath.get(workspace.path) ?? workspace.name, path: workspace.path }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    edges,
    source: edges.length > 0 ? 'workspace-manifests' : 'none'
  };
};
