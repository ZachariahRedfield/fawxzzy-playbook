export interface LaneOutcomeScore {
  lane_id: string;
  execution_duration: number;
  retry_count: number;
  success_rate: number;
  score: number;
}

export interface RouterAccuracyMetric {
  route_id: string;
  task_family: string;
  predicted_parallel_lanes: number;
  actual_parallel_lanes: number;
  predicted_validation_cost: number;
  actual_validation_cost: number;
  router_fit_score: number;
}


export interface RouterRecommendation {
  recommendation_id: string;
  task_family: string;
  current_strategy: string;
  recommended_strategy: string;
  evidence_count: number;
  supporting_runs: number;
  confidence_score: number;
  rationale: string;
  gating_tier: 'CONVERSATIONAL' | 'GOVERNANCE';
}
