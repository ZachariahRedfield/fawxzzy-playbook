import type { RouterAccuracyMetric } from '@zachariahredfield/playbook-core';
import type { ExecutionPlanArtifact } from '../routing/executionPlan.js';
import type { WorksetPlanArtifact } from '../orchestration/worksetPlan.js';
import type { OutcomeTelemetryArtifact, ProcessTelemetryArtifact } from './outcomeTelemetry.js';

type ExecutionStateArtifact = {
  lanes: Record<string, { lane_id: string; state: 'ready' | 'running' | 'completed' | 'failed' | 'blocked' }>;
};

export type RouterAccuracyComputationInput = {
  laneId: string;
  executionPlan: ExecutionPlanArtifact;
  worksetPlan: WorksetPlanArtifact;
  executionState: ExecutionStateArtifact;
  outcomeTelemetry: OutcomeTelemetryArtifact;
  processTelemetry?: ProcessTelemetryArtifact;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const round4 = (value: number): number => Number(value.toFixed(4));

const computeValidationCost = (required: number, optional: number): number => required * 2 + optional;

export const computeDeterministicRouterFitScore = (input: {
  predictedParallelLanes: number;
  actualParallelLanes: number;
  predictedValidationCost: number;
  actualValidationCost: number;
  executionSuccessRate: number;
  retryPressure: number;
}): number => {
  const laneDelta = Math.abs(input.predictedParallelLanes - input.actualParallelLanes);
  const laneDenominator = Math.max(input.predictedParallelLanes, input.actualParallelLanes, 1);
  const laneCountFit = clamp01(1 - laneDelta / laneDenominator);

  const validationDelta = Math.abs(input.predictedValidationCost - input.actualValidationCost);
  const validationDenominator = Math.max(input.predictedValidationCost, input.actualValidationCost, 1);
  const validationCostFit = clamp01(1 - validationDelta / validationDenominator);

  const executionSuccessFit = clamp01(input.executionSuccessRate);
  const retryPressureImpact = clamp01(1 - Math.min(input.retryPressure, 4) / 4);

  return round4(
    clamp01(laneCountFit * 0.3 + validationCostFit * 0.25 + executionSuccessFit * 0.25 + retryPressureImpact * 0.2)
  );
};

export const computeRouterAccuracyMetric = (input: RouterAccuracyComputationInput): RouterAccuracyMetric => {
  const taskFamily = input.executionPlan.task_family;
  const plannedFamilyLanes = input.worksetPlan.lanes.filter((lane) => lane.task_families.includes(taskFamily));
  const predictedParallelLanes = Math.max(1, plannedFamilyLanes.length);

  const laneIdsForFamily = new Set(plannedFamilyLanes.map((lane) => lane.lane_id));
  const familyActiveLanes = Object.entries(input.executionState.lanes)
    .filter(([laneId, lane]) =>
      laneIdsForFamily.has(laneId) && (lane.state === 'running' || lane.state === 'completed' || lane.state === 'failed')
    )
    .length;
  const totalActiveLanes = Object.values(input.executionState.lanes).filter(
    (lane) => lane.state === 'running' || lane.state === 'completed' || lane.state === 'failed'
  ).length;
  const actualParallelLanes = Math.max(1, familyActiveLanes, totalActiveLanes);

  const predictedValidationCost = computeValidationCost(
    input.executionPlan.required_validations.length,
    input.executionPlan.optional_validations.length
  );

  const processRecordsForLane = (input.processTelemetry?.records ?? []).filter((record) => record.route_id === input.laneId);
  const inferredActualValidationCost = processRecordsForLane.reduce(
    (sum, record) => sum + record.validators_run.length + (record.required_validations_selected?.length ?? 0),
    0
  );
  const actualValidationCost = Math.max(1, inferredActualValidationCost || predictedValidationCost);

  const laneOutcome = (input.outcomeTelemetry.lane_scores ?? []).find((score) => score.lane_id === input.laneId);
  const executionSuccessRate = laneOutcome?.success_rate ?? 0;
  const retryPressure = laneOutcome?.retry_count ?? 0;

  return {
    route_id: input.executionPlan.route_id,
    task_family: taskFamily,
    predicted_parallel_lanes: predictedParallelLanes,
    actual_parallel_lanes: actualParallelLanes,
    predicted_validation_cost: predictedValidationCost,
    actual_validation_cost: actualValidationCost,
    router_fit_score: computeDeterministicRouterFitScore({
      predictedParallelLanes,
      actualParallelLanes,
      predictedValidationCost,
      actualValidationCost,
      executionSuccessRate,
      retryPressure
    })
  };
};

export const summarizeRouterAccuracy = (metrics: RouterAccuracyMetric[]) => {
  if (metrics.length === 0) {
    return {
      total_records: 0,
      average_router_fit_score: 0,
      average_lane_delta: 0,
      average_validation_delta: 0
    };
  }

  const laneDelta = metrics.reduce((sum, metric) => sum + Math.abs(metric.predicted_parallel_lanes - metric.actual_parallel_lanes), 0);
  const validationDelta = metrics.reduce(
    (sum, metric) => sum + Math.abs(metric.predicted_validation_cost - metric.actual_validation_cost),
    0
  );

  return {
    total_records: metrics.length,
    average_router_fit_score: round4(metrics.reduce((sum, metric) => sum + metric.router_fit_score, 0) / metrics.length),
    average_lane_delta: round4(laneDelta / metrics.length),
    average_validation_delta: round4(validationDelta / metrics.length)
  };
};
