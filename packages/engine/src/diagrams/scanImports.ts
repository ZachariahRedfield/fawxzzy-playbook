import fs from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import type { DiagramOptions, WorkspaceNode } from './types.js';

const DEFAULT_EXCLUDES = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.next/**'];
const IMPORT_RE = /from\s+['\"]([^'\"]+)['\"]|import\(['\"]([^'\"]+)['\"]\)/g;

const listFiles = (root: string, dir: string, excludes: string[]): string[] => {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const results: string[] = [];
  const stack = [abs];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const relCurrent = path.relative(root, current).split(path.sep).join('/');
    if (relCurrent && excludes.some((glob) => minimatch(relCurrent, glob, { dot: true }))) continue;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(current, entry.name);
      const relChild = path.relative(root, child).split(path.sep).join('/');
      if (excludes.some((glob) => minimatch(relChild, glob, { dot: true }))) continue;
      if (entry.isDirectory()) stack.push(child);
      if (entry.isFile() && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) results.push(relChild);
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
};

export const scanImportsForInternalDeps = (
  root: string,
  workspaces: WorkspaceNode[],
  options: DiagramOptions = {}
): Array<{ from: string; to: string }> => {
  const excludes = options.excludeGlobs ?? DEFAULT_EXCLUDES;
  const edges = new Set<string>();

  for (const workspace of workspaces) {
    const files = listFiles(root, workspace.path, excludes);
    for (const file of files) {
      const content = fs.readFileSync(path.join(root, file), 'utf8');
      const matches = Array.from(content.matchAll(IMPORT_RE));
      for (const match of matches) {
        const target = match[1] ?? match[2];
        if (!target) continue;
        for (const candidate of workspaces) {
          if (candidate.name === workspace.name) continue;
          const scopedPath = `${candidate.path}/`;
          if (target === candidate.name || target.startsWith(`${candidate.name}/`) || target.includes(scopedPath)) {
            edges.add(`${workspace.name}->${candidate.name}`);
          }
        }
      }
    }
  }

  return Array.from(edges)
    .sort((a, b) => a.localeCompare(b))
    .map((edge) => {
      const [from, to] = edge.split('->');
      return { from, to };
    });
};
