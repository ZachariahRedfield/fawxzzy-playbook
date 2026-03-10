import { createHash } from 'node:crypto';
import type { PatternCardDraftArtifact } from '../schema/patternCardDraft.js';
import type { PromotionReviewQueue } from '../schema/promotion.js';
import { scorePromotionReadiness } from './scorePromotionReadiness.js';

export type BuildPromotionReviewQueueInput = {
  draftArtifact: PatternCardDraftArtifact;
  createdAt?: string;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const buildPromotionReviewQueue = ({ draftArtifact, createdAt }: BuildPromotionReviewQueueInput): PromotionReviewQueue => {
  const created = createdAt ?? new Date().toISOString();
  const items = draftArtifact.drafts
    .map((draft) => ({
      patternId: draft.patternId,
      canonicalKey: draft.canonicalKey,
      title: draft.title,
      sourceGroupId: draft.sourceGroupId,
      draftStatus: draft.draftStatus,
      readiness: scorePromotionReadiness(draft)
    }))
    .sort((left, right) =>
      right.readiness.promotionScore - left.readiness.promotionScore ||
      left.canonicalKey.localeCompare(right.canonicalKey) ||
      left.patternId.localeCompare(right.patternId)
    );

  const queueId = `promotion-review-queue:${draftArtifact.cycleId}:${createHash('sha256').update(draftArtifact.artifactId).update('|').update(created).digest('hex').slice(0, 12)}`;

  return {
    schemaVersion: '1.0',
    kind: 'playbook-promotion-review-queue',
    queueId,
    originCycleId: draftArtifact.cycleId,
    createdAt: created,
    items,
    metrics: {
      draftCount: items.length,
      holdCount: items.filter((item) => item.readiness.readinessBucket === 'hold').length,
      reviewCount: items.filter((item) => item.readiness.readinessBucket === 'review').length,
      readyCount: items.filter((item) => item.readiness.readinessBucket === 'ready').length,
      averagePromotionScore: round2(items.length === 0 ? 0 : items.reduce((sum, item) => sum + item.readiness.promotionScore, 0) / items.length),
      contradictionFlagCount: draftArtifact.drafts.reduce(
        (sum, draft) => sum + draft.conflictFlags.filter((flag) => flag.startsWith('contradiction:')).length,
        0
      ),
      boundaryFlagCount: draftArtifact.drafts.reduce((sum, draft) => sum + draft.boundaryFlags.length, 0)
    }
  };
};
