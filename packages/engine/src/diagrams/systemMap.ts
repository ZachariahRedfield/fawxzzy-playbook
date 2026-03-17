import fs from 'node:fs';
import path from 'node:path';
import { loadArchitecture } from '@zachariahredfield/playbook-core';

export const SYSTEM_MAP_RELATIVE_PATH = '.playbook/system-map.json' as const;
export const SYSTEM_MAP_SCHEMA_VERSION = '1.0' as const;

export type SystemMapLayer = {
  id: string;
  label: string;
};

export type SystemMapNode = {
  id: string;
  layer: string;
};

export type SystemMapEdge = {
  from: string;
  to: string;
};

export type SystemMapArtifact = {
  schemaVersion: typeof SYSTEM_MAP_SCHEMA_VERSION;
  kind: 'system-map';
  layers: SystemMapLayer[];
  nodes: SystemMapNode[];
  edges: SystemMapEdge[];
};

const SYSTEM_MAP_LAYERS: SystemMapLayer[] = [
  { id: 'observer', label: 'Observer Layer' },
  { id: 'control', label: 'Control Plane' },
  { id: 'runtime', label: 'Runtime Loop' },
  { id: 'review', label: 'PR Review Loop' },
  { id: 'evidence', label: 'Session + Evidence' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'core', label: 'Core Packages' }
];

const LAYER_ORDER = new Map(SYSTEM_MAP_LAYERS.map((layer, index) => [layer.id, index]));

const toNode = (id: string, layer: string): SystemMapNode => ({ id, layer });

const addNode = (nodes: Map<string, SystemMapNode>, node: SystemMapNode): void => {
  nodes.set(node.id, node);
};

const addEdge = (edges: Set<string>, from: string, to: string): void => {
  edges.add(`${from}->${to}`);
};

export const generateSystemMapArtifact = (repoRoot: string): SystemMapArtifact => {
  const architecture = loadArchitecture(repoRoot);
  const artifacts = new Set(architecture.subsystems.flatMap((subsystem) => subsystem.artifacts));

  const nodes = new Map<string, SystemMapNode>();
  const edges = new Set<string>();

  addNode(nodes, toNode('observer-server', 'observer'));

  addNode(nodes, toNode('policy', 'control'));
  addNode(nodes, toNode('apply', 'control'));

  addNode(nodes, toNode('cycle', 'runtime'));
  addNode(nodes, toNode('cycle-state', 'runtime'));
  addNode(nodes, toNode('cycle-history', 'runtime'));
  addNode(nodes, toNode('telemetry', 'runtime'));

  addNode(nodes, toNode('analyze-pr', 'review'));
  addNode(nodes, toNode('improve', 'review'));
  addNode(nodes, toNode('review-pr', 'review'));

  addNode(nodes, toNode('session', 'evidence'));
  addNode(nodes, toNode('evidence-envelope', 'evidence'));

  const governedArtifacts: Array<{ id: string; present: boolean }> = [
    { id: 'cycle-artifact', present: artifacts.has('.playbook/cycle-state.json') },
    { id: 'policy-artifact', present: artifacts.has('.playbook/policy-evaluation.json') },
    { id: 'apply-artifact', present: artifacts.has('.playbook/policy-apply-result.json') },
    { id: 'pr-review-artifact', present: artifacts.has('.playbook/pr-review.json') },
    { id: 'session-artifact', present: artifacts.has('.playbook/session.json') }
  ];
  for (const artifact of governedArtifacts) {
    if (artifact.present) {
      addNode(nodes, toNode(artifact.id, 'artifacts'));
    }
  }

  addNode(nodes, toNode('playbook-cli', 'core'));
  addNode(nodes, toNode('playbook-engine', 'core'));
  addNode(nodes, toNode('playbook-core', 'core'));

  if (nodes.has('cycle-state')) addEdge(edges, 'cycle', 'cycle-state');
  if (nodes.has('cycle-history')) addEdge(edges, 'cycle-state', 'cycle-history');
  if (nodes.has('telemetry')) addEdge(edges, 'cycle-history', 'telemetry');
  if (nodes.has('policy')) addEdge(edges, 'telemetry', 'policy');
  if (nodes.has('apply')) addEdge(edges, 'policy', 'apply');
  if (nodes.has('evidence-envelope')) addEdge(edges, 'apply', 'evidence-envelope');
  if (nodes.has('session')) addEdge(edges, 'evidence-envelope', 'session');

  if (nodes.has('analyze-pr') && nodes.has('improve')) addEdge(edges, 'analyze-pr', 'improve');
  if (nodes.has('improve') && nodes.has('policy')) addEdge(edges, 'improve', 'policy');
  if (nodes.has('policy') && nodes.has('review-pr')) addEdge(edges, 'policy', 'review-pr');

  addEdge(edges, 'observer-server', 'session');

  if (nodes.has('cycle-artifact')) addEdge(edges, 'cycle', 'cycle-artifact');
  if (nodes.has('policy-artifact') && nodes.has('policy')) addEdge(edges, 'policy', 'policy-artifact');
  if (nodes.has('apply-artifact') && nodes.has('apply')) addEdge(edges, 'apply', 'apply-artifact');
  if (nodes.has('pr-review-artifact') && nodes.has('review-pr')) addEdge(edges, 'review-pr', 'pr-review-artifact');
  if (nodes.has('session-artifact') && nodes.has('session')) addEdge(edges, 'session', 'session-artifact');

  addEdge(edges, 'playbook-cli', 'playbook-engine');
  addEdge(edges, 'playbook-engine', 'playbook-core');

  return {
    schemaVersion: SYSTEM_MAP_SCHEMA_VERSION,
    kind: 'system-map',
    layers: [...SYSTEM_MAP_LAYERS],
    nodes: [...nodes.values()].sort((left, right) => {
      const leftLayerOrder = LAYER_ORDER.get(left.layer) ?? Number.MAX_SAFE_INTEGER;
      const rightLayerOrder = LAYER_ORDER.get(right.layer) ?? Number.MAX_SAFE_INTEGER;
      if (leftLayerOrder !== rightLayerOrder) {
        return leftLayerOrder - rightLayerOrder;
      }
      return left.id.localeCompare(right.id);
    }),
    edges: [...edges]
      .map((entry) => {
        const [from, to] = entry.split('->');
        return { from, to };
      })
      .sort((left, right) => {
        const fromOrder = left.from.localeCompare(right.from);
        return fromOrder !== 0 ? fromOrder : left.to.localeCompare(right.to);
      })
  };
};

export const writeSystemMapArtifact = (repoRoot: string): { artifactPath: string; artifact: SystemMapArtifact } => {
  const artifactPath = path.join(repoRoot, SYSTEM_MAP_RELATIVE_PATH);
  const artifact = generateSystemMapArtifact(repoRoot);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return { artifactPath, artifact };
};
