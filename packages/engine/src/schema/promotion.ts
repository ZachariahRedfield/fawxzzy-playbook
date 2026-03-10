export const PROMOTION_READINESS_BUCKET = ['hold', 'review', 'ready'] as const;

export type PromotionReadinessBucket = (typeof PROMOTION_READINESS_BUCKET)[number];

export type PromotionReadiness = {
  patternId: string;
  promotionScore: number;
  readinessBucket: PromotionReadinessBucket;
  evidenceCount: number;
  evidenceDiversity: number;
  crossCycleRecurrence: number;
  reuseRate: number;
  compactionGain: number;
  entropyReductionEstimate: number;
  contradictionPenalty: number;
  boundaryPenalty: number;
  contractConflictPenalty: number;
  scoringReasons: string[];
};

export type PromotionReviewQueueItem = {
  patternId: string;
  canonicalKey: string;
  title: string;
  sourceGroupId: string;
  draftStatus: 'draft' | 'review' | 'ready';
  readiness: PromotionReadiness;
};

export type PromotionReviewQueue = {
  schemaVersion: '1.0';
  kind: 'playbook-promotion-review-queue';
  queueId: string;
  originCycleId: string;
  createdAt: string;
  items: PromotionReviewQueueItem[];
  metrics: {
    draftCount: number;
    holdCount: number;
    reviewCount: number;
    readyCount: number;
    averagePromotionScore: number;
    contradictionFlagCount: number;
    boundaryFlagCount: number;
  };
};
