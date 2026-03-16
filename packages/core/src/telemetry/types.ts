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

export type CommandExecutionSuccessStatus = 'success' | 'failure' | 'partial';

export interface CommandExecutionQualityRecord {
  command_name: string;
  run_id: string;
  inputs_summary: string;
  artifacts_read: string[];
  artifacts_written: string[];
  success_status: CommandExecutionSuccessStatus;
  duration_ms: number;
  warnings_count: number;
  open_questions_count: number;
  confidence_score: number;
  downstream_artifacts_produced: string[];
  recorded_at: string;
}
