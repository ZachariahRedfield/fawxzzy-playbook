import { describe, expect, it } from 'vitest';
import { computeRouterAccuracyMetric } from './routerAccuracy.js';

const baseInput = {
  laneId: 'lane-1',
  executionPlan: {
    task_family: 'engine_scoring',
    route_id: 'deterministic_local:engine_scoring',
    required_validations: ['pnpm -r build'],
    optional_validations: ['pnpm playbook verify --ci --json']
  },
  worksetPlan: {
    lanes: [{ lane_id: 'lane-1', task_families: ['engine_scoring'] }]
  },
  executionState: {
    lanes: {
      'lane-1': { lane_id: 'lane-1', state: 'completed' as const }
    }
  },
  outcomeTelemetry: {
    lane_scores: [{ lane_id: 'lane-1', execution_duration: 1000, retry_count: 0, success_rate: 1, score: 0.75 }]
  }
};

describe('routerAccuracy', () => {
  it('scores accurate routing fit highly', () => {
    const metric = computeRouterAccuracyMetric(baseInput as never);

    expect(metric.predicted_parallel_lanes).toBe(1);
    expect(metric.actual_parallel_lanes).toBe(1);
    expect(metric.router_fit_score).toBeGreaterThan(0.9);
  });

  it('penalizes over-fragmented routing', () => {
    const metric = computeRouterAccuracyMetric({
      ...(baseInput as never),
      worksetPlan: {
        lanes: [
          { lane_id: 'lane-1', task_families: ['engine_scoring'] },
          { lane_id: 'lane-2', task_families: ['engine_scoring'] }
        ]
      }
    });

    expect(metric.predicted_parallel_lanes).toBe(2);
    expect(metric.actual_parallel_lanes).toBe(1);
    expect(metric.router_fit_score).toBeLessThan(0.86);
  });

  it('penalizes under-fragmented routing', () => {
    const metric = computeRouterAccuracyMetric({
      ...(baseInput as never),
      executionState: {
        lanes: {
          'lane-1': { lane_id: 'lane-1', state: 'completed' as const },
          'lane-2': { lane_id: 'lane-2', state: 'completed' as const }
        }
      }
    });

    expect(metric.predicted_parallel_lanes).toBe(1);
    expect(metric.actual_parallel_lanes).toBe(2);
    expect(metric.router_fit_score).toBeLessThan(0.86);
  });

  it('penalizes retry-heavy routing outcomes', () => {
    const metric = computeRouterAccuracyMetric({
      ...(baseInput as never),
      outcomeTelemetry: {
        lane_scores: [{ lane_id: 'lane-1', execution_duration: 1000, retry_count: 4, success_rate: 1, score: 0 }]
      }
    });

    expect(metric.router_fit_score).toBeLessThan(0.9);
  });
});
