import path from 'node:path';
import fs from 'node:fs';
import { minimatch } from 'minimatch';
import type { DiagramOptions, StructureModel } from './types.js';
import { discoverWorkspaces } from './scanWorkspaceDeps.js';
import { toPosixPath } from '../util/paths.js';

const DEFAULT_INCLUDE_DIRS = ['apps', 'packages', 'tools', 'src'];
const DEFAULT_EXCLUDES = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.next/**'];

export const scanRepoStructure = (root: string, options: DiagramOptions = {}): StructureModel => {
  const includeDirs = options.includeDirs ?? DEFAULT_INCLUDE_DIRS;
  const excludes = options.excludeGlobs ?? DEFAULT_EXCLUDES;
  const isExcluded = (value: string): boolean =>
    excludes.some((glob) => minimatch(value, glob, { dot: true }) || minimatch(`${value}/`, glob, { dot: true }));

  const topLevelDirs = includeDirs
    .filter((dir) => fs.existsSync(path.join(root, dir)))
    .map((dir) => toPosixPath(dir))
    .filter((dir) => !isExcluded(dir))
    .sort((a, b) => a.localeCompare(b));

  const workspaces = discoverWorkspaces(root, options)
    .filter((workspace) => !isExcluded(workspace.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  const containmentEdges = workspaces
    .map((workspace) => {
      const container = topLevelDirs.find((dir) => workspace.path === dir || workspace.path.startsWith(`${dir}/`));
      return container ? { from: container, to: workspace.name } : null;
    })
    .filter((edge): edge is { from: string; to: string } => Boolean(edge))
    .sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`));

  return {
    rootName: path.basename(root),
    topLevelDirs,
    workspaces,
    containmentEdges
  };
};
