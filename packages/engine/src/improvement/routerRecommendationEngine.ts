import fs from 'node:fs';
import path from 'node:path';
import type { LearningStateSnapshotArtifact } from '../telemetry/learningState.js';
import type { OutcomeTelemetryArtifact, ProcessTelemetryArtifact } from '../telemetry/outcomeTelemetry.js';
import { readRepositoryEvents, type ExecutionOutcomeEvent, type RouteDecisionEvent } from '../memory/events.js';

export const ROUTER_RECOMMENDATIONS_SCHEMA_VERSION = '1.0' as const;
export const ROUTER_RECOMMENDATIONS_RELATIVE_PATH = '.playbook/router-recommendations.json' as const;

export type RouterRecommendationGatingTier = 'CONVERSATIONAL' | 'GOVERNANCE';

export type RouterRecommendation = {
  recommendation_id: string;
  task_family: string;
  current_strategy: string;
  recommended_strategy: string;
  evidence_count: number;
  supporting_runs: number;
  confidence_score: number;
  rationale: string;
  gating_tier: RouterRecommendationGatingTier;
};

export type RejectedRouterRecommendation = {
  recommendation_id: string;
  task_family: string;
  current_strategy: string;
  recommended_strategy: string;
  evidence_count: number;
  supporting_runs: number;
  confidence_score: number;
  rationale: string;
  gating_tier: RouterRecommendationGatingTier;
  rejection_reasons: string[];
};

export type RouterRecommendationsArtifact = {
  schemaVersion: typeof ROUTER_RECOMMENDATIONS_SCHEMA_VERSION;
  kind: 'router-recommendations';
  generatedAt: string;
  proposalOnly: true;
  thresholds: {
    minimum_evidence_count: number;
    minimum_supporting_runs: number;
    minimum_confidence: number;
  };
  sourceArtifacts: {
    processTelemetryPath: string;
    outcomeTelemetryPath: string;
    learningStatePath: string;
    memoryEventsPath: string;
    processTelemetryAvailable: boolean;
    outcomeTelemetryAvailable: boolean;
    learningStateAvailable: boolean;
  };
  summary: {
    total: number;
    conversational: number;
    governance: number;
    rejected: number;
  };
  recommendations: RouterRecommendation[];
  rejected_recommendations: RejectedRouterRecommendation[];
};

type FamilyAggregate = {
  taskFamily: string;
  currentStrategy: string;
  processCount: number;
  avgRouterFit: number;
  avgLaneDelta: number;
  avgValidationDelta: number;
  overFragmentedCount: number;
  underFragmentedCount: number;
  lowLaneScoreCount: number;
  successfulLaneCount: number;
  runKeys: Set<string>;
};

const MINIMUM_EVIDENCE_COUNT = 3;
const MINIMUM_SUPPORTING_RUNS = 2;
const MINIMUM_CONFIDENCE = 0.6;
const LANE_SCORE_GOOD_THRESHOLD = 0.75;

const round4 = (value: number): number => Number(value.toFixed(4));
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const deterministicStringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const runKeyFromTimestamp = (timestamp: string): string => timestamp.slice(0, 10);

const readJsonFileIfExists = <T>(filePath: string): T | undefined => {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
};

const toRecommendationId = (input: { taskFamily: string; strategy: string; mode: string }): string =>
  `routing_${input.mode}_${input.taskFamily}_${input.strategy}`.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

const buildConfidence = (input: {
  evidenceCount: number;
  supportingRuns: number;
  signalStrength: number;
  learningConfidence: number;
}): number =>
  round4(
    clamp01(
      Math.min(1, input.evidenceCount / 6) * 0.4 +
        Math.min(1, input.supportingRuns / 3) * 0.2 +
        clamp01(input.signalStrength) * 0.25 +
        clamp01(input.learningConfidence) * 0.15
    )
  );

const evaluateRejectionReasons = (input: {
  evidenceCount: number;
  supportingRuns: number;
  confidenceScore: number;
}): string[] => {
  const reasons: string[] = [];
  if (input.evidenceCount < MINIMUM_EVIDENCE_COUNT) {
    reasons.push(`insufficient_evidence_count:${input.evidenceCount}<${MINIMUM_EVIDENCE_COUNT}`);
  }
  if (input.supportingRuns < MINIMUM_SUPPORTING_RUNS) {
    reasons.push(`insufficient_supporting_runs:${input.supportingRuns}<${MINIMUM_SUPPORTING_RUNS}`);
  }
  if (input.confidenceScore < MINIMUM_CONFIDENCE) {
    reasons.push(`confidence_below_threshold:${input.confidenceScore}<${MINIMUM_CONFIDENCE}`);
  }
  return reasons;
};

const emitRecommendation = (input: {
  recommendationId: string;
  taskFamily: string;
  currentStrategy: string;
  recommendedStrategy: string;
  evidenceCount: number;
  supportingRuns: number;
  signalStrength: number;
  learningConfidence: number;
  rationale: string;
  gatingTier: RouterRecommendationGatingTier;
}): { recommendation: RouterRecommendation | null; rejected: RejectedRouterRecommendation | null } => {
  const confidenceScore = buildConfidence({
    evidenceCount: input.evidenceCount,
    supportingRuns: input.supportingRuns,
    signalStrength: input.signalStrength,
    learningConfidence: input.learningConfidence
  });

  const rejectionReasons = evaluateRejectionReasons({
    evidenceCount: input.evidenceCount,
    supportingRuns: input.supportingRuns,
    confidenceScore
  });

  if (rejectionReasons.length > 0) {
    return {
      recommendation: null,
      rejected: {
        recommendation_id: input.recommendationId,
        task_family: input.taskFamily,
        current_strategy: input.currentStrategy,
        recommended_strategy: input.recommendedStrategy,
        evidence_count: input.evidenceCount,
        supporting_runs: input.supportingRuns,
        confidence_score: confidenceScore,
        rationale: input.rationale,
        gating_tier: input.gatingTier,
        rejection_reasons: rejectionReasons
      }
    };
  }

  return {
    recommendation: {
      recommendation_id: input.recommendationId,
      task_family: input.taskFamily,
      current_strategy: input.currentStrategy,
      recommended_strategy: input.recommendedStrategy,
      evidence_count: input.evidenceCount,
      supporting_runs: input.supportingRuns,
      confidence_score: confidenceScore,
      rationale: input.rationale,
      gating_tier: input.gatingTier
    },
    rejected: null
  };
};

const aggregateFamilies = (
  processTelemetry: ProcessTelemetryArtifact | undefined,
  outcomeTelemetry: OutcomeTelemetryArtifact | undefined,
  routeDecisionEvents: RouteDecisionEvent[],
  executionOutcomeEvents: ExecutionOutcomeEvent[]
): FamilyAggregate[] => {
  const routeByRun = new Map<string, string>();
  for (const event of routeDecisionEvents) {
    const key = event.run_id || runKeyFromTimestamp(event.timestamp);
    routeByRun.set(key, event.task_family);
  }

  const successfulByFamily = new Map<string, number>();
  for (const event of executionOutcomeEvents) {
    if (event.outcome !== 'success') {
      continue;
    }
    const key = event.run_id || runKeyFromTimestamp(event.timestamp);
    const family = routeByRun.get(key);
    if (family) {
      successfulByFamily.set(family, (successfulByFamily.get(family) ?? 0) + 1);
    }
  }

  const laneScores = outcomeTelemetry?.lane_scores ?? [];
  const processRecords = processTelemetry?.records ?? [];
  const grouped = new Map<string, FamilyAggregate>();

  for (const record of processRecords) {
    const strategy = record.route_id ?? 'unknown-route';
    const aggregate = grouped.get(record.task_family) ?? {
      taskFamily: record.task_family,
      currentStrategy: strategy,
      processCount: 0,
      avgRouterFit: 0,
      avgLaneDelta: 0,
      avgValidationDelta: 0,
      overFragmentedCount: 0,
      underFragmentedCount: 0,
      lowLaneScoreCount: 0,
      successfulLaneCount: successfulByFamily.get(record.task_family) ?? 0,
      runKeys: new Set<string>()
    };

    aggregate.processCount += 1;
    aggregate.avgRouterFit += record.router_fit_score ?? 0;
    aggregate.avgLaneDelta += Math.abs((record.predicted_parallel_lanes ?? 1) - (record.actual_parallel_lanes ?? 1));
    aggregate.avgValidationDelta += Math.abs((record.predicted_validation_cost ?? 0) - (record.actual_validation_cost ?? 0));

    const predicted = record.predicted_parallel_lanes ?? 1;
    const actual = record.actual_parallel_lanes ?? 1;
    if (predicted > actual) {
      aggregate.overFragmentedCount += 1;
    }
    if (actual > predicted) {
      aggregate.underFragmentedCount += 1;
    }

    const laneScore = laneScores.find((entry) => entry.lane_id === record.id);
    if (laneScore && laneScore.score < LANE_SCORE_GOOD_THRESHOLD) {
      aggregate.lowLaneScoreCount += 1;
    }

    aggregate.runKeys.add(runKeyFromTimestamp(record.recordedAt));

    grouped.set(record.task_family, aggregate);
  }

  return [...grouped.values()]
    .map((aggregate) => ({
      ...aggregate,
      avgRouterFit: round4(aggregate.avgRouterFit / Math.max(aggregate.processCount, 1)),
      avgLaneDelta: round4(aggregate.avgLaneDelta / Math.max(aggregate.processCount, 1)),
      avgValidationDelta: round4(aggregate.avgValidationDelta / Math.max(aggregate.processCount, 1))
    }))
    .sort((left, right) => left.taskFamily.localeCompare(right.taskFamily));
};

export const generateRouterRecommendations = (repoRoot: string): RouterRecommendationsArtifact => {
  const processTelemetryPath = path.join(repoRoot, '.playbook', 'process-telemetry.json');
  const outcomeTelemetryPath = path.join(repoRoot, '.playbook', 'outcome-telemetry.json');
  const learningStatePath = path.join(repoRoot, '.playbook', 'learning-state.json');

  const processTelemetry = readJsonFileIfExists<ProcessTelemetryArtifact>(processTelemetryPath);
  const outcomeTelemetry = readJsonFileIfExists<OutcomeTelemetryArtifact>(outcomeTelemetryPath);
  const learningState = readJsonFileIfExists<LearningStateSnapshotArtifact>(learningStatePath);
  const events = readRepositoryEvents(repoRoot);
  const routeDecisionEvents = events.filter((event): event is RouteDecisionEvent => event.event_type === 'route_decision');
  const executionOutcomeEvents = events.filter((event): event is ExecutionOutcomeEvent => event.event_type === 'execution_outcome');

  const learningConfidence = learningState?.confidenceSummary.overall_confidence ?? 0;
  const validationCostPressure = learningState?.metrics.validation_cost_pressure ?? 0;
  const familyAggregates = aggregateFamilies(processTelemetry, outcomeTelemetry, routeDecisionEvents, executionOutcomeEvents);

  const recommendations: RouterRecommendation[] = [];
  const rejected: RejectedRouterRecommendation[] = [];

  for (const aggregate of familyAggregates) {
    if (aggregate.overFragmentedCount >= 2) {
      const result = emitRecommendation({
        recommendationId: toRecommendationId({
          taskFamily: aggregate.taskFamily,
          strategy: aggregate.currentStrategy,
          mode: 'over_fragmented'
        }),
        taskFamily: aggregate.taskFamily,
        currentStrategy: aggregate.currentStrategy,
        recommendedStrategy: 'reduce_parallel_fragmentation',
        evidenceCount: aggregate.overFragmentedCount,
        supportingRuns: aggregate.runKeys.size,
        signalStrength: clamp01((1 - aggregate.avgRouterFit) * 0.6 + Math.min(1, aggregate.avgLaneDelta / 2) * 0.4),
        learningConfidence,
        rationale: `${aggregate.taskFamily} repeatedly planned more lanes than were effectively used with degraded router-fit evidence.`,
        gatingTier: 'CONVERSATIONAL'
      });
      if (result.recommendation) recommendations.push(result.recommendation);
      if (result.rejected) rejected.push(result.rejected);
    }

    if (aggregate.underFragmentedCount >= 2) {
      const result = emitRecommendation({
        recommendationId: toRecommendationId({
          taskFamily: aggregate.taskFamily,
          strategy: aggregate.currentStrategy,
          mode: 'under_fragmented'
        }),
        taskFamily: aggregate.taskFamily,
        currentStrategy: aggregate.currentStrategy,
        recommendedStrategy: 'increase_parallel_fragmentation',
        evidenceCount: aggregate.underFragmentedCount,
        supportingRuns: aggregate.runKeys.size,
        signalStrength: clamp01((1 - aggregate.avgRouterFit) * 0.55 + Math.min(1, aggregate.avgLaneDelta / 2) * 0.45),
        learningConfidence,
        rationale: `${aggregate.taskFamily} repeatedly needed more active lanes than predicted, indicating under-fragmented routing.`,
        gatingTier: 'CONVERSATIONAL'
      });
      if (result.recommendation) recommendations.push(result.recommendation);
      if (result.rejected) rejected.push(result.rejected);
    }

    if (aggregate.avgValidationDelta >= 2 || (validationCostPressure >= 0.6 && aggregate.lowLaneScoreCount >= 2)) {
      const result = emitRecommendation({
        recommendationId: toRecommendationId({
          taskFamily: aggregate.taskFamily,
          strategy: aggregate.currentStrategy,
          mode: 'validation_posture'
        }),
        taskFamily: aggregate.taskFamily,
        currentStrategy: aggregate.currentStrategy,
        recommendedStrategy: 'rebalance_validation_posture',
        evidenceCount: Math.max(aggregate.lowLaneScoreCount, Math.ceil(aggregate.avgValidationDelta)),
        supportingRuns: aggregate.runKeys.size,
        signalStrength: clamp01(validationCostPressure * 0.5 + Math.min(1, aggregate.avgValidationDelta / 4) * 0.5),
        learningConfidence,
        rationale: `${aggregate.taskFamily} shows repeated validation mismatch signals; recommendation is governance-gated to prevent silent router drift.`,
        gatingTier: 'GOVERNANCE'
      });
      if (result.recommendation) recommendations.push(result.recommendation);
      if (result.rejected) rejected.push(result.rejected);
    }

    if (aggregate.successfulLaneCount >= 3 && aggregate.avgRouterFit >= 0.75) {
      const result = emitRecommendation({
        recommendationId: toRecommendationId({
          taskFamily: aggregate.taskFamily,
          strategy: aggregate.currentStrategy,
          mode: 'successful_lane_pattern'
        }),
        taskFamily: aggregate.taskFamily,
        currentStrategy: aggregate.currentStrategy,
        recommendedStrategy: `preserve_${aggregate.currentStrategy}_baseline`,
        evidenceCount: aggregate.successfulLaneCount,
        supportingRuns: aggregate.runKeys.size,
        signalStrength: clamp01(aggregate.avgRouterFit),
        learningConfidence,
        rationale: `${aggregate.taskFamily} has repeat successful lane outcomes under ${aggregate.currentStrategy}; preserve as explicit baseline recommendation.`,
        gatingTier: 'CONVERSATIONAL'
      });
      if (result.recommendation) recommendations.push(result.recommendation);
      if (result.rejected) rejected.push(result.rejected);
    }
  }

  const orderedRecommendations = recommendations.sort((left, right) => {
    if (right.confidence_score !== left.confidence_score) {
      return right.confidence_score - left.confidence_score;
    }
    return left.recommendation_id.localeCompare(right.recommendation_id);
  });

  const orderedRejected = rejected.sort((left, right) => left.recommendation_id.localeCompare(right.recommendation_id));

  return {
    schemaVersion: ROUTER_RECOMMENDATIONS_SCHEMA_VERSION,
    kind: 'router-recommendations',
    generatedAt: new Date().toISOString(),
    proposalOnly: true,
    thresholds: {
      minimum_evidence_count: MINIMUM_EVIDENCE_COUNT,
      minimum_supporting_runs: MINIMUM_SUPPORTING_RUNS,
      minimum_confidence: MINIMUM_CONFIDENCE
    },
    sourceArtifacts: {
      processTelemetryPath: '.playbook/process-telemetry.json',
      outcomeTelemetryPath: '.playbook/outcome-telemetry.json',
      learningStatePath: '.playbook/learning-state.json',
      memoryEventsPath: '.playbook/memory/events/*',
      processTelemetryAvailable: Boolean(processTelemetry),
      outcomeTelemetryAvailable: Boolean(outcomeTelemetry),
      learningStateAvailable: Boolean(learningState)
    },
    summary: {
      total: orderedRecommendations.length,
      conversational: orderedRecommendations.filter((entry) => entry.gating_tier === 'CONVERSATIONAL').length,
      governance: orderedRecommendations.filter((entry) => entry.gating_tier === 'GOVERNANCE').length,
      rejected: orderedRejected.length
    },
    recommendations: orderedRecommendations,
    rejected_recommendations: orderedRejected
  };
};

export const writeRouterRecommendationsArtifact = (
  repoRoot: string,
  artifact: RouterRecommendationsArtifact,
  artifactPath = ROUTER_RECOMMENDATIONS_RELATIVE_PATH
): string => {
  const resolvedPath = path.resolve(repoRoot, artifactPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, deterministicStringify(artifact), 'utf8');
  return resolvedPath;
};
