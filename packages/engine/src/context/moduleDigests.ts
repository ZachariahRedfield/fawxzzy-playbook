import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryGraph } from '../graph/repoGraph.js';
import type { RepositoryIndex } from '../indexer/repoIndexer.js';
import { queryModuleOwners } from '../query/moduleOwners.js';
import { queryRisk } from '../query/risk.js';

export const MODULE_DIGESTS_RELATIVE_PATH = '.playbook/module-digests.json' as const;
export const MODULE_DIGESTS_SCHEMA_VERSION = '1.0' as const;

export type ModuleDigest = {
  id: string;
  summary: string;
  dependencies: {
    direct: string[];
    directCount: number;
  };
  dependents: {
    direct: string[];
    transitive: string[];
    directCount: number;
    transitiveCount: number;
  };
  ownership: {
    area: string;
    owners: string[];
    status: 'configured' | 'no-metadata-configured' | 'intentionally-unowned' | 'inherited-default' | 'unresolved-mapping';
    source: string;
    sourceLocation?: string;
  };
  risk: {
    level: 'low' | 'medium' | 'high';
    score: number;
    signals: string[];
  };
  keyReferences: {
    docs: string[];
    contracts: string[];
    commands: string[];
  };
  digest: {
    hash: string;
    algorithm: 'sha256';
  };
  provenance: {
    indexArtifact: '.playbook/repo-index.json';
    graphArtifact: '.playbook/repo-graph.json';
    ownershipArtifact: '.playbook/module-owners.json' | 'generated-default';
  };
};

export type ModuleDigestsArtifact = {
  schemaVersion: typeof MODULE_DIGESTS_SCHEMA_VERSION;
  kind: 'playbook-module-digests';
  modules: ModuleDigest[];
};

const toSortedUnique = (values: string[]): string[] => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

const computeTransitiveDependents = (moduleName: string, reverseGraph: Map<string, string[]>): string[] => {
  const visited = new Set<string>();
  const queue = [...(reverseGraph.get(moduleName) ?? [])];

  for (const dependent of queue) visited.add(dependent);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const dependent of reverseGraph.get(current) ?? []) {
      if (!visited.has(dependent)) {
        visited.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return toSortedUnique([...visited]);
};

const buildReverseGraph = (index: RepositoryIndex): Map<string, string[]> => {
  const reverseGraph = new Map<string, string[]>();
  for (const moduleEntry of index.modules) reverseGraph.set(moduleEntry.name, []);
  for (const moduleEntry of index.modules) {
    for (const dependency of moduleEntry.dependencies) {
      reverseGraph.set(dependency, [...(reverseGraph.get(dependency) ?? []), moduleEntry.name]);
    }
  }
  for (const [moduleName, dependents] of reverseGraph.entries()) {
    reverseGraph.set(moduleName, toSortedUnique(dependents));
  }
  return reverseGraph;
};

const toDependencyKinds = (graph: RepositoryGraph, moduleId: string): { outgoingKinds: string[]; incomingKinds: string[] } => ({
  outgoingKinds: toSortedUnique(graph.edges.filter((edge) => edge.from === moduleId).map((edge) => edge.kind)),
  incomingKinds: toSortedUnique(graph.edges.filter((edge) => edge.to === moduleId).map((edge) => edge.kind))
});

const summaryForModule = (moduleName: string, outgoingKinds: string[], incomingKinds: string[]): string => {
  const neighborhood = `out[${outgoingKinds.join(', ') || 'none'}], in[${incomingKinds.join(', ') || 'none'}]`;
  return `Module ${moduleName} encapsulates bounded repository behavior with graph neighborhood ${neighborhood}.`;
};

const digestHash = (input: Omit<ModuleDigest, 'digest'>): string => {
  const serialized = JSON.stringify(input);
  return crypto.createHash('sha256').update(serialized).digest('hex');
};

export const buildModuleDigestsArtifact = (projectRoot: string, index: RepositoryIndex, graph: RepositoryGraph): ModuleDigestsArtifact => {
  const ownership = queryModuleOwners(projectRoot);
  const ownershipEntries = 'modules' in ownership ? ownership.modules : [ownership.module];
  const ownershipMap = new Map(
    ownershipEntries.map((entry) => [
      entry.name,
      {
        area: entry.area,
        owners: [...entry.owners],
        status: entry.ownership.status,
        source: entry.ownership.source,
        sourceLocation: entry.ownership.sourceLocation
      }
    ])
  );
  const reverseGraph = buildReverseGraph(index);

  const modules = [...index.modules]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((moduleEntry) => {
      const moduleId = `module:${moduleEntry.name}`;
      const neighborhoodKinds = toDependencyKinds(graph, moduleId);
      const directDependents = toSortedUnique([...(reverseGraph.get(moduleEntry.name) ?? [])]);
      const transitiveDependents = computeTransitiveDependents(moduleEntry.name, reverseGraph);
      const risk = queryRisk(projectRoot, moduleEntry.name);
      const ownerEntry = ownershipMap.get(moduleEntry.name);

      const digestWithoutHash: Omit<ModuleDigest, 'digest'> = {
        id: moduleEntry.name,
        summary: summaryForModule(moduleEntry.name, neighborhoodKinds.outgoingKinds, neighborhoodKinds.incomingKinds),
        dependencies: {
          direct: toSortedUnique([...moduleEntry.dependencies]),
          directCount: moduleEntry.dependencies.length
        },
        dependents: {
          direct: directDependents,
          transitive: transitiveDependents,
          directCount: directDependents.length,
          transitiveCount: transitiveDependents.length
        },
        ownership: {
          area: ownerEntry?.area ?? 'unassigned',
          owners: ownerEntry ? toSortedUnique(ownerEntry.owners) : [],
          status: ownerEntry?.status ?? 'no-metadata-configured',
          source: ownerEntry?.source ?? 'generated-default',
          sourceLocation: ownerEntry?.sourceLocation
        },
        risk: {
          level: risk.riskLevel,
          score: risk.riskScore,
          signals: toSortedUnique([...risk.reasons, ...((risk.warnings ?? []).map((warning) => `warning: ${warning}`))])
        },
        keyReferences: {
          docs: ownerEntry?.sourceLocation ? [ownerEntry.sourceLocation] : [],
          contracts: toSortedUnique(['docs/contracts/repository-graph-contract.md']),
          commands: [
            'playbook query modules --json',
            'playbook query dependencies --json',
            'playbook query module-owners --json',
            `playbook ask "how does ${moduleEntry.name} work?" --repo-context --module ${moduleEntry.name} --json`,
            `playbook explain ${moduleEntry.name} --json`
          ]
        },
        provenance: {
          indexArtifact: '.playbook/repo-index.json',
          graphArtifact: '.playbook/repo-graph.json',
          ownershipArtifact: ownerEntry?.source === '.playbook/module-owners.json' ? '.playbook/module-owners.json' : 'generated-default'
        }
      };

      return {
        ...digestWithoutHash,
        digest: {
          hash: digestHash(digestWithoutHash),
          algorithm: 'sha256' as const
        }
      };
    });

  return {
    schemaVersion: MODULE_DIGESTS_SCHEMA_VERSION,
    kind: 'playbook-module-digests',
    modules
  };
};

export const writeModuleDigestsArtifact = (projectRoot: string, artifact: ModuleDigestsArtifact): void => {
  const artifactPath = path.join(projectRoot, MODULE_DIGESTS_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
};

export const readModuleDigestsArtifact = (projectRoot: string): ModuleDigestsArtifact | null => {
  const artifactPath = path.join(projectRoot, MODULE_DIGESTS_RELATIVE_PATH);
  if (!fs.existsSync(artifactPath)) return null;
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as ModuleDigestsArtifact;
};

export const readModuleDigest = (projectRoot: string, moduleName: string): ModuleDigest | null =>
  readModuleDigestsArtifact(projectRoot)?.modules.find((entry) => entry.id === moduleName) ?? null;
