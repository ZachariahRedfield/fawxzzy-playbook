export const doctrineLifecycleStages = ['candidate', 'compacted', 'promoted', 'retired'] as const;
export type DoctrineLifecycleStage = (typeof doctrineLifecycleStages)[number];

export const doctrineGatingTiers = ['AUTO-SAFE', 'CONVERSATIONAL', 'GOVERNANCE'] as const;
export type DoctrineGatingTier = (typeof doctrineGatingTiers)[number];

export type DoctrinePromotionCandidate = {
  candidate_id: string;
  source_evidence: string[];
  related_runs: string[];
  related_artifacts: string[];
  pattern_family: string;
  confidence_score: number;
  lifecycle_stage: DoctrineLifecycleStage;
  promotion_rationale: string;
  retirement_rationale?: string;
  gating_tier: DoctrineGatingTier;
};
