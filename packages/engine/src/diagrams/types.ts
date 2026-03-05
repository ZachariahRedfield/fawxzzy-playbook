export type DiagramOptions = {
  maxNodes?: number;
  maxEdges?: number;
  includeDirs?: string[];
  excludeGlobs?: string[];
};

export type WorkspaceNode = {
  name: string;
  path: string;
};

export type StructureModel = {
  rootName: string;
  topLevelDirs: string[];
  workspaces: WorkspaceNode[];
  containmentEdges: Array<{ from: string; to: string }>;
};

export type DependencyModel = {
  workspaces: WorkspaceNode[];
  edges: Array<{ from: string; to: string }>;
  source: 'workspace-manifests' | 'imports-fallback' | 'none';
};

export type MermaidDiagramResult = {
  mermaid: string;
  warnings: string[];
  stats: {
    nodes: number;
    edges: number;
    cappedNodes: boolean;
    cappedEdges: boolean;
  };
};
