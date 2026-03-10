import type { PatternCardDraft } from '../schema/patternCardDraft.js';
import type { PromotionReadiness, PromotionReadinessBucket } from '../schema/promotion.js';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const round2 = (value: number): number => Math.round(value * 100) / 100;

const evidenceDiversityFromRefs = (evidenceRefs: string[]): number => {
  const prefixes = new Set(evidenceRefs.map((entry) => entry.split(':')[0] ?? entry));
  return prefixes.size;
};

export const scorePromotionReadiness = (draft: PatternCardDraft): PromotionReadiness => {
  const evidenceCount = draft.evidenceRefs.length;
  const evidenceDiversity = evidenceDiversityFromRefs(draft.evidenceRefs);
  const crossCycleRecurrence = draft.recurrence.cycleCount;
  const reuseRate = round2(clamp(draft.linkedContractRefs.length / Math.max(1, draft.sourceZettelIds.length), 0, 1));
  const compactionGain = round2(clamp((draft.sourceZettelIds.length - 1) / Math.max(1, draft.sourceZettelIds.length), 0, 1));
  const entropyReductionEstimate = round2(clamp(compactionGain * (0.6 + crossCycleRecurrence * 0.08), 0, 1));

  const contradictionPenalty = round2(clamp(draft.conflictFlags.filter((flag) => flag.startsWith('contradiction:')).length * 0.12, 0, 0.6));
  const boundaryPenalty = round2(clamp(draft.boundaryFlags.length * 0.08, 0, 0.4));
  const contractConflictPenalty = round2(clamp(draft.conflictFlags.includes('contract_conflict') ? 0.25 : 0, 0, 0.25));

  const rawScore =
    evidenceCount * 4 +
    evidenceDiversity * 6 +
    crossCycleRecurrence * 8 +
    reuseRate * 15 +
    compactionGain * 12 +
    entropyReductionEstimate * 12 -
    contradictionPenalty * 100 -
    boundaryPenalty * 100 -
    contractConflictPenalty * 100;

  const promotionScore = round2(clamp(rawScore, 0, 100));

  let readinessBucket: PromotionReadinessBucket = 'hold';
  if (promotionScore >= 75 && contradictionPenalty === 0 && boundaryPenalty <= 0.08 && contractConflictPenalty === 0) {
    readinessBucket = 'ready';
  } else if (promotionScore >= 45) {
    readinessBucket = 'review';
  }

  const scoringReasons = [
    `evidence_count:${evidenceCount}`,
    `evidence_diversity:${evidenceDiversity}`,
    `cross_cycle_recurrence:${crossCycleRecurrence}`,
    `reuse_rate:${reuseRate}`,
    `compaction_gain:${compactionGain}`,
    `entropy_reduction_estimate:${entropyReductionEstimate}`,
    `contradiction_penalty:${contradictionPenalty}`,
    `boundary_penalty:${boundaryPenalty}`,
    `contract_conflict_penalty:${contractConflictPenalty}`,
    `bucket:${readinessBucket}`
  ];

  return {
    patternId: draft.patternId,
    promotionScore,
    readinessBucket,
    evidenceCount,
    evidenceDiversity,
    crossCycleRecurrence,
    reuseRate,
    compactionGain,
    entropyReductionEstimate,
    contradictionPenalty,
    boundaryPenalty,
    contractConflictPenalty,
    scoringReasons
  };
};
