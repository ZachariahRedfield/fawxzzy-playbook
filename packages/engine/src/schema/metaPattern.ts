export const META_PATTERN_SCHEMA_VERSION = '1.0' as const;

export type MetaPattern = {
  patternId: string;
  canonicalKey: string;
  occurrences: number;
  promotedCount: number;
  rejectedCount: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  linkedContractRefs: string[];
  sourceArtifactRefs: string[];
};

export type MetaPatternsArtifact = {
  schemaVersion: typeof META_PATTERN_SCHEMA_VERSION;
  kind: 'playbook-meta-patterns';
  createdAt: string;
  patterns: MetaPattern[];
};

export type MetaTelemetryArtifact = {
  schemaVersion: typeof META_PATTERN_SCHEMA_VERSION;
  kind: 'playbook-meta-telemetry';
  createdAt: string;
  totals: {
    runCycles: number;
    graphSnapshots: number;
    groups: number;
    candidatePatterns: number;
    patternCards: number;
    promotionDecisions: number;
    contractEvents: number;
  };
  rates: {
    promotionLatencyAvgHours: number;
    rejectionRate: number;
    patternReuseRate: number;
    contractDriftRate: number;
    entropyTrendSlope: number;
    duplicationRate: number;
  };
  artifactRefs: string[];
};
