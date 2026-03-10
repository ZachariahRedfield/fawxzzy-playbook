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
  orphanVertexCount: number;
  zettelCount: number;
  linkedZettelCount: number;
  patternCardCount: number;
  contractCount: number;
};

export const GROUPING_REASON = [
  'exact_canonical_key',
  'exact_normalized_subject',
  'shared_contract_ref',
  'shared_artifact_ref',
  'typed_connectivity'
] as const;

export type GroupingReason = (typeof GROUPING_REASON)[number];

export const GROUP_COMPATIBILITY_STATUS = ['compatible', 'rejected'] as const;

export type GroupCompatibilityStatus = (typeof GROUP_COMPATIBILITY_STATUS)[number];

export const GROUP_BOUNDARY_FLAG = [
  'cross_contract_conflict',
  'invariant_conflict',
  'mechanism_conflict',
  'subject_domain_conflict'
] as const;

export type GroupBoundaryFlag = (typeof GROUP_BOUNDARY_FLAG)[number];

export type GraphGroup = {
  groupId: string;
  originCycleId: string;
  memberVertexIds: string[];
  memberZettelIds: string[];
  groupingReasons: GroupingReason[];
  compatibilityStatus: GroupCompatibilityStatus;
  boundaryFlags: GroupBoundaryFlag[];
  sharedCanonicalKey?: string;
  sharedContractRefs: string[];
  evidenceCount: number;
  confidence: number;
};

export type GraphGroupingMetrics = {
  componentCount: number;
  singletonComponentCount: number;
  largestComponentSize: number;
  avgComponentSize: number;
  groupableZettelCount: number;
  candidatePatternCount: number;
  contractionRatio: number;
  orphanRate: number;
  boundaryConflictCount: number;
  crossContractConflictCount: number;
};

export type GraphGroupArtifact = {
  schemaVersion: '1.0';
  kind: 'playbook-graph-groups';
  artifactId: string;
  snapshotId: string;
  cycleId: string;
  createdAt: string;
  groups: GraphGroup[];
  metrics: GraphGroupingMetrics;
};

export type CandidatePatternPreview = {
  candidateId: string;
  originCycleId: string;
  sourceGroupId: string;
  memberZettelIds: string[];
  title: string;
  canonicalKey: string;
  summary: string;
  mechanism?: string;
  invariant?: string;
  evidenceRefs: string[];
  contractRefs: string[];
  confidence: number;
  compactionScore: number;
  boundaryFlags: GroupBoundaryFlag[];
  promotionReadiness: 'low' | 'medium' | 'high';
};

export type CandidatePatternPreviewArtifact = {
  schemaVersion: '1.0';
  kind: 'playbook-candidate-pattern-preview';
  artifactId: string;
  cycleId: string;
  snapshotId: string;
  groupsArtifactId: string;
  createdAt: string;
  candidates: CandidatePatternPreview[];
  metrics: {
    candidatePatternCount: number;
    contractionRatio: number;
    avgConfidence: number;
  };
};

export type GraphSnapshot = {
  snapshotId: string;
  cycleId: string;
  createdAt: string;
  vertices: GraphVertex[];
  edges: GraphEdge[];
  relations?: RelationVertex[];
  metrics: GraphSnapshotMetrics;
};
