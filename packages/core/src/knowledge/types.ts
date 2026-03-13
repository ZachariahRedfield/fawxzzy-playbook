export const knowledgeArtifactTypes = ['evidence', 'candidate', 'promoted', 'superseded'] as const;
export type KnowledgeArtifactType = (typeof knowledgeArtifactTypes)[number];

export const knowledgeRecordStatuses = ['observed', 'active', 'stale', 'retired', 'superseded'] as const;
export type KnowledgeRecordStatus = (typeof knowledgeRecordStatuses)[number];

export const knowledgeSourceKinds = ['memory-event', 'memory-candidate', 'memory-knowledge'] as const;
export type KnowledgeSourceKind = (typeof knowledgeSourceKinds)[number];

export type KnowledgeRecordSource = {
  kind: KnowledgeSourceKind;
  path: string;
  command: string | null;
};

export type KnowledgeRecordProvenance = {
  repo: string;
  sourceCommand: string | null;
  runId: string | null;
  sourcePath: string;
  eventIds: string[];
  evidenceIds: string[];
  fingerprints: string[];
  relatedRecordIds: string[];
};

export type KnowledgeRecord = {
  id: string;
  type: KnowledgeArtifactType;
  createdAt: string;
  repo: string;
  source: KnowledgeRecordSource;
  confidence: number | null;
  status: KnowledgeRecordStatus;
  provenance: KnowledgeRecordProvenance;
  metadata: Record<string, unknown>;
};

export type KnowledgeQueryOptions = {
  type?: KnowledgeArtifactType;
  status?: KnowledgeRecordStatus;
  module?: string;
  ruleId?: string;
  text?: string;
  limit?: number;
  order?: 'asc' | 'desc';
  staleDays?: number;
};

export type KnowledgeTimelineOptions = KnowledgeQueryOptions;

export type KnowledgeProvenanceResult = {
  record: KnowledgeRecord;
  evidence: KnowledgeRecord[];
  relatedRecords: KnowledgeRecord[];
};

export type KnowledgeSummary = {
  total: number;
  byType: Record<KnowledgeArtifactType, number>;
  byStatus: Record<KnowledgeRecordStatus, number>;
};
