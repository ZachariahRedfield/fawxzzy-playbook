import type { DependencyModel, DiagramOptions, MermaidDiagramResult, StructureModel } from './types.js';

const DEFAULT_MAX_NODES = 60;
const DEFAULT_MAX_EDGES = 120;

const idFor = (value: string): string =>
  value
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_/, 'n_');

const capDiagram = (
  nodes: string[],
  edges: Array<{ from: string; to: string }>,
  options: DiagramOptions
): MermaidDiagramResult => {
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const maxEdges = options.maxEdges ?? DEFAULT_MAX_EDGES;

  let diagramNodes = [...nodes].sort((a, b) => a.localeCompare(b));
  let diagramEdges = [...edges].sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`));

  const warnings: string[] = [];
  let cappedNodes = false;
  let cappedEdges = false;

  if (diagramNodes.length > maxNodes) {
    cappedNodes = true;
    const kept = diagramNodes.slice(0, Math.max(maxNodes - 1, 1));
    const overflow = diagramNodes.length - kept.length;
    const overflowNode = `overflow_${overflow}_nodes`;
    const keptSet = new Set(kept);
    diagramNodes = [...kept, overflowNode];
    diagramEdges = diagramEdges.map((edge) => ({
      from: keptSet.has(edge.from) ? edge.from : overflowNode,
      to: keptSet.has(edge.to) ? edge.to : overflowNode
    }));
    warnings.push(`Node cap applied (${maxNodes}). Collapsed ${overflow} node(s) into ${overflowNode}.`);
  }

  if (diagramEdges.length > maxEdges) {
    cappedEdges = true;
    const overflow = diagramEdges.length - maxEdges;
    diagramEdges = diagramEdges.slice(0, maxEdges);
    warnings.push(`Edge cap applied (${maxEdges}). Omitted ${overflow} edge(s).`);
  }

  diagramEdges = diagramEdges
    .map((edge) => `${edge.from}->${edge.to}`)
    .filter((edge, index, all) => all.indexOf(edge) === index)
    .map((edge) => {
      const [from, to] = edge.split('->');
      return { from, to };
    })
    .sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`));

  const lines = ['flowchart TB'];
  for (const node of diagramNodes) {
    lines.push(`  ${idFor(node)}["${node}"]`);
  }
  for (const edge of diagramEdges) {
    lines.push(`  ${idFor(edge.from)} --> ${idFor(edge.to)}`);
  }

  return {
    mermaid: lines.join('\n'),
    warnings,
    stats: {
      nodes: diagramNodes.length,
      edges: diagramEdges.length,
      cappedNodes,
      cappedEdges
    }
  };
};

export const generateMermaidStructure = (model: StructureModel, options: DiagramOptions = {}): MermaidDiagramResult => {
  const nodes = [...model.topLevelDirs, ...model.workspaces.map((workspace) => workspace.name)]
    .sort((a, b) => a.localeCompare(b));
  return capDiagram(nodes, model.containmentEdges, options);
};

export const generateMermaidDeps = (model: DependencyModel, options: DiagramOptions = {}): MermaidDiagramResult => {
  const nodes = model.workspaces.map((workspace) => workspace.name).sort((a, b) => a.localeCompare(b));
  return capDiagram(nodes, model.edges, options);
};
