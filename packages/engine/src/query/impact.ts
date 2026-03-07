import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryIndex, RepositoryModule } from '../indexer/repoIndexer.js';

export type ImpactQueryResult = {
  schemaVersion: '1.0';
  command: 'query';
  type: 'impact';
  module: string;
  affectedModules: string[];
};

const INDEX_RELATIVE_PATH = '.playbook/repo-index.json' as const;

const readRepositoryIndex = (projectRoot: string): RepositoryIndex => {
  const indexPath = path.join(projectRoot, INDEX_RELATIVE_PATH);
  if (!fs.existsSync(indexPath)) {
    throw new Error('playbook query: missing repository index at .playbook/repo-index.json. Run "playbook index" first.');
  }

  const raw = fs.readFileSync(indexPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<RepositoryIndex>;

  if (parsed.schemaVersion !== '1.0') {
    throw new Error(
      `playbook query: unsupported repository index schemaVersion "${String(parsed.schemaVersion)}". Expected "1.0".`
    );
  }

  return parsed as RepositoryIndex;
};

const buildReverseGraph = (modules: RepositoryModule[]): Map<string, string[]> => {
  const reverseGraph = new Map<string, string[]>();

  for (const moduleEntry of modules) {
    reverseGraph.set(moduleEntry.name, []);
  }

  for (const moduleEntry of modules) {
    for (const dependency of moduleEntry.dependencies) {
      const dependents = reverseGraph.get(dependency) ?? [];
      dependents.push(moduleEntry.name);
      reverseGraph.set(dependency, dependents);
    }
  }

  return reverseGraph;
};

export const queryImpact = (projectRoot: string, moduleName: string): ImpactQueryResult => {
  const index = readRepositoryIndex(projectRoot);
  const targetModule = index.modules.find((moduleEntry) => moduleEntry.name === moduleName);

  if (!targetModule) {
    throw new Error(`playbook query impact: unknown module "${moduleName}".`);
  }

  const reverseGraph = buildReverseGraph(index.modules);
  const visited = new Set<string>();
  const affectedModules: string[] = [];
  const queue = [...(reverseGraph.get(moduleName) ?? [])];

  for (const moduleEntry of queue) {
    visited.add(moduleEntry);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    affectedModules.push(current);

    for (const dependent of reverseGraph.get(current) ?? []) {
      if (!visited.has(dependent)) {
        visited.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return {
    schemaVersion: '1.0',
    command: 'query',
    type: 'impact',
    module: moduleName,
    affectedModules
  };
};
