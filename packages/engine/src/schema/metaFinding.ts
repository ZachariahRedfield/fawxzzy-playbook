export const META_FINDING_SCHEMA_VERSION = '1.0' as const;

export const META_FINDING_TYPES = [
  'promotion_latency',
  'rejection_rate',
  'pattern_reuse',
  'contract_drift',
  'entropy_trend',
  'duplication'
] as const;

export type MetaFindingType = (typeof META_FINDING_TYPES)[number];

export type MetaFindingSeverity = 'low' | 'medium' | 'high';

export type MetaFinding = {
  findingId: string;
  type: MetaFindingType;
  title: string;
  summary: string;
  severity: MetaFindingSeverity;
  value: number;
  threshold?: number;
  trend?: 'improving' | 'stable' | 'degrading';
  artifactRefs: string[];
  recommendation: string;
};

export type MetaImprovementProposal = {
  proposalId: string;
  findingId: string;
  createdAt: string;
  kind: 'playbook-meta-improvement-proposal';
  status: 'draft';
  title: string;
  summary: string;
  actions: string[];
  guardrail: 'meta-proposals-cannot-mutate-doctrine';
  artifactRefs: string[];
};

export type MetaFindingsArtifact = {
  schemaVersion: typeof META_FINDING_SCHEMA_VERSION;
  kind: 'playbook-meta-findings';
  createdAt: string;
  findings: MetaFinding[];
  proposals: MetaImprovementProposal[];
};
