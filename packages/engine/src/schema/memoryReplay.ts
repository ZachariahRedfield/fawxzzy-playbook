export type MemoryCandidateKind = 'decision' | 'pattern' | 'failure_mode' | 'invariant' | 'open_question';

export type MemoryReplayEventReference = {
  eventId: string;
  relativePath: string;
};

export type MemoryReplayIndex = {
  schemaVersion?: string;
  events: MemoryReplayEventReference[];
};

export type MemoryReplayCandidateProvenance = {
  eventId: string;
  sourcePath: string;
  fingerprint: string;
  runId: string | null;
};

export type MemoryReplaySalienceFactors = {
  severity: number;
  recurrenceCount: number;
  blastRadius: number;
  crossModuleSpread: number;
  ownershipDocsGap: number;
  novelSuccessfulRemediationSignal: number;
};

export type MemoryReplayCandidateSupersession = {
  evolutionOrdinal: number;
  priorCandidateIds: string[];
  supersedesCandidateIds: string[];
};

export type MemoryReplayCandidate = {
  candidateId: string;
  kind: MemoryCandidateKind;
  title: string;
  summary: string;
  clusterKey: string;
  salienceScore: number;
  salienceFactors: MemoryReplaySalienceFactors;
  fingerprint: string;
  module: string;
  ruleId: string;
  failureShape: string;
  eventCount: number;
  provenance: MemoryReplayCandidateProvenance[];
  lastSeenAt?: string;
  supersession: MemoryReplayCandidateSupersession;
};

export type MemoryReplayResult = {
  schemaVersion: '1.0';
  command: 'memory-replay';
  sourceIndex: '.playbook/memory/index.json';
  generatedAt: string;
  totalEvents: number;
  clustersEvaluated: number;
  candidates: MemoryReplayCandidate[];
};
