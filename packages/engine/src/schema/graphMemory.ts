export const VERTEX_KIND = [
  'RunCycle',
  'Artifact',
  'Zettel',
  'PatternCard',
  'Contract',
  'Subject',
  'Decision'
] as const;

export type VertexKind = (typeof VERTEX_KIND)[number];

export const EDGE_KIND = [
  'PRODUCED',
  'CITES',
  'SUPPORTS',
  'DERIVES',
  'SIMILAR_TO',
  'MEMBER_OF',
  'PROMOTES_TO',
  'VIOLATES',
  'SUPERSEDES',
  'APPLIES_TO'
] as const;

export type EdgeKind = (typeof EDGE_KIND)[number];

export type GraphVertexStatus =
  | 'working'
  | 'converging'
  | 'contracted'
  | 'promoted'
  | 'retired';

export type GraphVertex = {
  id: string;
  kind: VertexKind;
  status: GraphVertexStatus;
  originCycleId: string;
  sourceArtifactPath?: string;
  canonicalKey?: string;
  evidenceCount: number;
  entropyCost: number;
  metadata: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  kind: EdgeKind;
  from: string;
  to: string;
  weight?: number;
  confidence?: number;
  originCycleId: string;
  evidenceRefs: string[];
};

export type RelationVertex = {
  id: string;
  relationKind: EdgeKind;
  participantIds: string[];
  evidenceRefs: string[];
  originCycleId: string;
};

export type GraphSnapshotMetrics = {
  vertexCount: number;
  edgeCount: number;
  relationVertexCount: number;
  componentCount: number;
  contractedVertexCount: number;
  promotedContractCount: number;
  entropyCostTotal: number;
};

export type GraphSnapshot = {
  snapshotId: string;
  cycleId: string;
  vertices: GraphVertex[];
  edges: GraphEdge[];
  relations?: RelationVertex[];
  metrics: GraphSnapshotMetrics;
};
