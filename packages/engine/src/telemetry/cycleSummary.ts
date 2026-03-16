export type CycleResult = 'success' | 'failed';

export type CycleHistoryRecord = {
  cycle_id: string;
  started_at: string;
  result: CycleResult;
  failed_step?: string;
  duration_ms: number;
};

export type CycleHistoryArtifact = {
  history_version: number;
  repo: string;
  cycles: CycleHistoryRecord[];
};

export type CycleStateStep = {
  name: string;
  status: 'success' | 'failure';
  duration_ms: number;
};

export type CycleStateArtifact = {
  cycle_version: number;
  repo: string;
  cycle_id: string;
  started_at: string;
  result: CycleResult;
  failed_step?: string;
  steps: CycleStateStep[];
  artifacts_written?: string[];
};

export type CycleTelemetryRecentCycle = {
  cycle_id: string;
  started_at: string;
  result: CycleResult;
  failed_step?: string;
  duration_ms: number;
};

export type CycleTelemetrySummary = {
  cycles_total: number;
  cycles_success: number;
  cycles_failed: number;
  success_rate: number;
  average_duration_ms: number;
  most_common_failed_step: string | null;
  failure_distribution: Record<string, number>;
  recent_cycles: CycleTelemetryRecentCycle[];
  latest_cycle_state?: {
    cycle_id: string;
    started_at: string;
    result: CycleResult;
    failed_step?: string;
    duration_ms: number;
  };
};

export type CycleRegressionWindowSummary = {
  cycles_total: number;
  cycles_success: number;
  cycles_failed: number;
  success_rate: number;
  average_duration_ms: number;
  dominant_failed_step: string | null;
  dominant_failed_step_share: number;
};

export type CycleRegressionComparisonWindow = {
  window_size: number;
  minimum_cycles_required: number;
  recent_cycles: number;
  prior_cycles: number;
  sufficient_history: boolean;
};

export type CycleRegressionSummary = {
  regression_detected: boolean;
  regression_reasons: string[];
  comparison_window: CycleRegressionComparisonWindow;
  recent_summary: CycleRegressionWindowSummary;
  prior_summary: CycleRegressionWindowSummary;
};

const CYCLE_REGRESSION_WINDOW_SIZE = 3;
const SUCCESS_RATE_DROP_THRESHOLD = 0.34;
const DURATION_INCREASE_RATIO_THRESHOLD = 1.25;
const FAILED_STEP_DOMINANCE_SHARE_THRESHOLD = 0.75;
const FAILED_STEP_DOMINANCE_COUNT_THRESHOLD = 2;

const toRate = (numerator: number, denominator: number): number => {
  if (denominator <= 0) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(4));
};

const toAverage = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
};

const summarizeFailureDistribution = (cycles: CycleHistoryRecord[]): Record<string, number> => {
  const failures = new Map<string, number>();

  for (const cycle of cycles) {
    if (cycle.result !== 'failed' || !cycle.failed_step) {
      continue;
    }

    failures.set(cycle.failed_step, (failures.get(cycle.failed_step) ?? 0) + 1);
  }

  return Object.fromEntries([...failures.entries()].sort(([left], [right]) => left.localeCompare(right)));
};

const mostCommonFailedStep = (distribution: Record<string, number>): string | null => {
  const entries = Object.entries(distribution);
  if (entries.length === 0) {
    return null;
  }

  entries.sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });

  return entries[0]?.[0] ?? null;
};

const toLatestStateSummary = (state: CycleStateArtifact): CycleTelemetrySummary['latest_cycle_state'] => {
  const durationMs = state.steps.reduce((sum, step) => sum + step.duration_ms, 0);
  return {
    cycle_id: state.cycle_id,
    started_at: state.started_at,
    result: state.result,
    ...(state.failed_step ? { failed_step: state.failed_step } : {}),
    duration_ms: durationMs
  };
};

const summarizeRegressionWindow = (cycles: CycleHistoryRecord[]): CycleRegressionWindowSummary => {
  const cyclesTotal = cycles.length;
  const cyclesSuccess = cycles.filter((cycle) => cycle.result === 'success').length;
  const failureDistribution = summarizeFailureDistribution(cycles);
  const dominantFailedStep = mostCommonFailedStep(failureDistribution);
  const dominantFailedStepCount = dominantFailedStep ? (failureDistribution[dominantFailedStep] ?? 0) : 0;
  const cyclesFailed = cyclesTotal - cyclesSuccess;

  return {
    cycles_total: cyclesTotal,
    cycles_success: cyclesSuccess,
    cycles_failed: cyclesFailed,
    success_rate: toRate(cyclesSuccess, cyclesTotal),
    average_duration_ms: toAverage(cycles.map((cycle) => cycle.duration_ms)),
    dominant_failed_step: dominantFailedStep,
    dominant_failed_step_share: toRate(dominantFailedStepCount, cyclesFailed)
  };
};

export const summarizeCycleRegressions = (input: {
  cycleHistory?: CycleHistoryArtifact;
  windowSize?: number;
}): CycleRegressionSummary => {
  const windowSize = input.windowSize ?? CYCLE_REGRESSION_WINDOW_SIZE;
  const minimumCyclesRequired = windowSize * 2;
  const cycles = [...(input.cycleHistory?.cycles ?? [])];

  cycles.sort((left, right) => {
    const delta = Date.parse(right.started_at) - Date.parse(left.started_at);
    if (Number.isNaN(delta) || delta === 0) {
      return left.cycle_id.localeCompare(right.cycle_id);
    }

    return delta;
  });

  const recentWindow = cycles.slice(0, windowSize);
  const priorWindow = cycles.slice(windowSize, windowSize * 2);
  const recentSummary = summarizeRegressionWindow(recentWindow);
  const priorSummary = summarizeRegressionWindow(priorWindow);

  const result: CycleRegressionSummary = {
    regression_detected: false,
    regression_reasons: [],
    comparison_window: {
      window_size: windowSize,
      minimum_cycles_required: minimumCyclesRequired,
      recent_cycles: recentWindow.length,
      prior_cycles: priorWindow.length,
      sufficient_history: cycles.length >= minimumCyclesRequired
    },
    recent_summary: recentSummary,
    prior_summary: priorSummary
  };

  if (!result.comparison_window.sufficient_history) {
    result.regression_reasons.push(
      `insufficient_history: need >=${minimumCyclesRequired} cycles for comparison windows (current=${cycles.length})`
    );
    return result;
  }

  const successRateDrop = Number((priorSummary.success_rate - recentSummary.success_rate).toFixed(4));
  if (successRateDrop >= SUCCESS_RATE_DROP_THRESHOLD) {
    result.regression_reasons.push(
      `success_rate_drop: prior=${priorSummary.success_rate}, recent=${recentSummary.success_rate}, threshold=${SUCCESS_RATE_DROP_THRESHOLD}`
    );
  }

  const durationIncreaseRatio =
    priorSummary.average_duration_ms <= 0
      ? 0
      : Number((recentSummary.average_duration_ms / priorSummary.average_duration_ms).toFixed(4));
  if (durationIncreaseRatio >= DURATION_INCREASE_RATIO_THRESHOLD) {
    result.regression_reasons.push(
      `duration_increase: prior=${priorSummary.average_duration_ms}, recent=${recentSummary.average_duration_ms}, ratio=${durationIncreaseRatio}, threshold=${DURATION_INCREASE_RATIO_THRESHOLD}`
    );
  }

  if (
    recentSummary.dominant_failed_step &&
    recentSummary.cycles_failed >= FAILED_STEP_DOMINANCE_COUNT_THRESHOLD &&
    recentSummary.dominant_failed_step_share >= FAILED_STEP_DOMINANCE_SHARE_THRESHOLD
  ) {
    result.regression_reasons.push(
      `failed_step_concentration: step=${recentSummary.dominant_failed_step}, share=${recentSummary.dominant_failed_step_share}, failed_cycles=${recentSummary.cycles_failed}, threshold_share=${FAILED_STEP_DOMINANCE_SHARE_THRESHOLD}`
    );
  }

  result.regression_detected = result.regression_reasons.length > 0;
  return result;
};

export const summarizeCycleTelemetry = (input: {
  cycleHistory?: CycleHistoryArtifact;
  cycleState?: CycleStateArtifact;
  recentLimit?: number;
}): CycleTelemetrySummary => {
  const recentLimit = input.recentLimit ?? 5;
  const cycles = [...(input.cycleHistory?.cycles ?? [])];

  cycles.sort((left, right) => {
    const delta = Date.parse(right.started_at) - Date.parse(left.started_at);
    if (Number.isNaN(delta) || delta === 0) {
      return left.cycle_id.localeCompare(right.cycle_id);
    }

    return delta;
  });

  const cyclesTotal = cycles.length;
  const cyclesSuccess = cycles.filter((cycle) => cycle.result === 'success').length;
  const cyclesFailed = cyclesTotal - cyclesSuccess;
  const failureDistribution = summarizeFailureDistribution(cycles);

  const summary: CycleTelemetrySummary = {
    cycles_total: cyclesTotal,
    cycles_success: cyclesSuccess,
    cycles_failed: cyclesFailed,
    success_rate: toRate(cyclesSuccess, cyclesTotal),
    average_duration_ms: toAverage(cycles.map((cycle) => cycle.duration_ms)),
    most_common_failed_step: mostCommonFailedStep(failureDistribution),
    failure_distribution: failureDistribution,
    recent_cycles: cycles.slice(0, recentLimit).map((cycle) => ({
      cycle_id: cycle.cycle_id,
      started_at: cycle.started_at,
      result: cycle.result,
      ...(cycle.failed_step ? { failed_step: cycle.failed_step } : {}),
      duration_ms: cycle.duration_ms
    }))
  };

  // Empty-history contract: latest cycle-state is surfaced whenever the state
  // artifact exists, even if cycle-history is absent. History-derived metrics
  // remain zeroed from the missing history artifact.
  if (input.cycleState) {
    summary.latest_cycle_state = toLatestStateSummary(input.cycleState);
  }

  return summary;
};
