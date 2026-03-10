export const PATTERN_CARD_DRAFT_SCHEMA_VERSION = '1.0' as const;

export const PATTERN_CARD_DRAFT_STATUS = ['draft', 'review', 'ready'] as const;

export type PatternCardDraftStatus = (typeof PATTERN_CARD_DRAFT_STATUS)[number];

export type PatternCardDraftRecurrence = {
  cycleCount: number;
  latestCycleId: string;
  sourceCycleIds: string[];
};

export type PatternCardDraft = {
  patternId: string;
  originCycleId: string;
  sourceGroupId: string;
  sourceZettelIds: string[];
  sourceArtifactPaths: string[];
  canonicalKey: string;
  title: string;
  summary: string;
  mechanism?: string;
  invariant?: string;
  evidenceRefs: string[];
  linkedContractRefs: string[];
  recurrence: PatternCardDraftRecurrence;
  conflictFlags: string[];
  boundaryFlags: string[];
  draftStatus: PatternCardDraftStatus;
};

export type PatternCardDraftArtifact = {
  schemaVersion: typeof PATTERN_CARD_DRAFT_SCHEMA_VERSION;
  kind: 'playbook-pattern-card-drafts';
  artifactId: string;
  cycleId: string;
  snapshotId: string;
  sourceCandidateArtifactId: string;
  createdAt: string;
  drafts: PatternCardDraft[];
  metrics: {
    draftCount: number;
    conflictFlagCount: number;
    boundaryFlagCount: number;
  };
};
