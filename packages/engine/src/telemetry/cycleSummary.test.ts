import { describe, expect, it } from 'vitest';
import { summarizeCycleRegressions, summarizeCycleTelemetry } from './cycleSummary.js';

describe('cycle telemetry summary', () => {
  it('computes deterministic summary metrics from governed cycle history', () => {
    const summary = summarizeCycleTelemetry({
      cycleHistory: {
        history_version: 1,
        repo: '/repo',
        cycles: [
          {
            cycle_id: 'cycle-001',
            started_at: '2026-03-15T00:00:00.000Z',
            result: 'success',
            duration_ms: 1000
          },
          {
            cycle_id: 'cycle-002',
            started_at: '2026-03-15T01:00:00.000Z',
            result: 'failed',
            failed_step: 'verify',
            duration_ms: 2000
          },
          {
            cycle_id: 'cycle-003',
            started_at: '2026-03-15T02:00:00.000Z',
            result: 'failed',
            failed_step: 'execute',
            duration_ms: 4000
          },
          {
            cycle_id: 'cycle-004',
            started_at: '2026-03-15T03:00:00.000Z',
            result: 'failed',
            failed_step: 'execute',
            duration_ms: 3000
          }
        ]
      }
    });

    expect(summary.cycles_total).toBe(4);
    expect(summary.cycles_success).toBe(1);
    expect(summary.cycles_failed).toBe(3);
    expect(summary.success_rate).toBe(0.25);
    expect(summary.average_duration_ms).toBe(2500);
    expect(summary.failure_distribution).toEqual({
      execute: 2,
      verify: 1
    });
    expect(summary.most_common_failed_step).toBe('execute');
    expect(summary.recent_cycles[0]?.cycle_id).toBe('cycle-004');
  });

  it('returns stable empty summary when no cycle history exists', () => {
    const summary = summarizeCycleTelemetry({});

    expect(summary).toEqual({
      cycles_total: 0,
      cycles_success: 0,
      cycles_failed: 0,
      success_rate: 0,
      average_duration_ms: 0,
      most_common_failed_step: null,
      failure_distribution: {},
      recent_cycles: []
    });
  });


  it('surfaces latest cycle-state even when history is absent', () => {
    const summary = summarizeCycleTelemetry({
      cycleState: {
        cycle_version: 1,
        repo: '/repo',
        cycle_id: 'cycle-state-only',
        started_at: '2026-03-16T00:00:00.000Z',
        result: 'success',
        steps: [
          { name: 'verify', status: 'success', duration_ms: 20 },
          { name: 'plan', status: 'success', duration_ms: 30 }
        ]
      }
    });

    expect(summary).toEqual({
      cycles_total: 0,
      cycles_success: 0,
      cycles_failed: 0,
      success_rate: 0,
      average_duration_ms: 0,
      most_common_failed_step: null,
      failure_distribution: {},
      recent_cycles: [],
      latest_cycle_state: {
        cycle_id: 'cycle-state-only',
        started_at: '2026-03-16T00:00:00.000Z',
        result: 'success',
        duration_ms: 50
      }
    });
  });

  it('includes latest cycle-state snapshot when present', () => {
    const summary = summarizeCycleTelemetry({
      cycleHistory: {
        history_version: 1,
        repo: '/repo',
        cycles: []
      },
      cycleState: {
        cycle_version: 1,
        repo: '/repo',
        cycle_id: 'cycle-live',
        started_at: '2026-03-16T00:00:00.000Z',
        result: 'failed',
        failed_step: 'telemetry',
        steps: [
          { name: 'verify', status: 'success', duration_ms: 25 },
          { name: 'telemetry', status: 'failure', duration_ms: 75 }
        ]
      }
    });

    expect(summary.latest_cycle_state).toEqual({
      cycle_id: 'cycle-live',
      started_at: '2026-03-16T00:00:00.000Z',
      result: 'failed',
      failed_step: 'telemetry',
      duration_ms: 100
    });
  });
});


describe('cycle regression summary', () => {
  it('degrades safely when history is missing', () => {
    const summary = summarizeCycleRegressions({});

    expect(summary.regression_detected).toBe(false);
    expect(summary.regression_reasons).toEqual([
      'insufficient_history: need >=6 cycles for comparison windows (current=0)'
    ]);
    expect(summary.comparison_window.sufficient_history).toBe(false);
  });

  it('detects success-rate regression across deterministic windows', () => {
    const summary = summarizeCycleRegressions({
      cycleHistory: {
        history_version: 1,
        repo: '/repo',
        cycles: [
          { cycle_id: 'c1', started_at: '2026-03-16T06:00:00.000Z', result: 'failed', failed_step: 'execute', duration_ms: 200 },
          { cycle_id: 'c2', started_at: '2026-03-16T05:00:00.000Z', result: 'failed', failed_step: 'execute', duration_ms: 220 },
          { cycle_id: 'c3', started_at: '2026-03-16T04:00:00.000Z', result: 'failed', failed_step: 'verify', duration_ms: 230 },
          { cycle_id: 'c4', started_at: '2026-03-16T03:00:00.000Z', result: 'success', duration_ms: 150 },
          { cycle_id: 'c5', started_at: '2026-03-16T02:00:00.000Z', result: 'success', duration_ms: 160 },
          { cycle_id: 'c6', started_at: '2026-03-16T01:00:00.000Z', result: 'success', duration_ms: 170 }
        ]
      }
    });

    expect(summary.regression_detected).toBe(true);
    expect(summary.regression_reasons.some((reason) => reason.startsWith('success_rate_drop:'))).toBe(true);
  });

  it('detects duration regression across deterministic windows', () => {
    const summary = summarizeCycleRegressions({
      cycleHistory: {
        history_version: 1,
        repo: '/repo',
        cycles: [
          { cycle_id: 'c1', started_at: '2026-03-16T06:00:00.000Z', result: 'success', duration_ms: 400 },
          { cycle_id: 'c2', started_at: '2026-03-16T05:00:00.000Z', result: 'success', duration_ms: 450 },
          { cycle_id: 'c3', started_at: '2026-03-16T04:00:00.000Z', result: 'success', duration_ms: 500 },
          { cycle_id: 'c4', started_at: '2026-03-16T03:00:00.000Z', result: 'success', duration_ms: 100 },
          { cycle_id: 'c5', started_at: '2026-03-16T02:00:00.000Z', result: 'success', duration_ms: 110 },
          { cycle_id: 'c6', started_at: '2026-03-16T01:00:00.000Z', result: 'success', duration_ms: 120 }
        ]
      }
    });

    expect(summary.regression_detected).toBe(true);
    expect(summary.regression_reasons.some((reason) => reason.startsWith('duration_increase:'))).toBe(true);
  });

  it('detects repeated failed-step concentration in recent failures', () => {
    const summary = summarizeCycleRegressions({
      cycleHistory: {
        history_version: 1,
        repo: '/repo',
        cycles: [
          { cycle_id: 'c1', started_at: '2026-03-16T06:00:00.000Z', result: 'failed', failed_step: 'execute', duration_ms: 200 },
          { cycle_id: 'c2', started_at: '2026-03-16T05:00:00.000Z', result: 'failed', failed_step: 'execute', duration_ms: 210 },
          { cycle_id: 'c3', started_at: '2026-03-16T04:00:00.000Z', result: 'failed', failed_step: 'execute', duration_ms: 220 },
          { cycle_id: 'c4', started_at: '2026-03-16T03:00:00.000Z', result: 'failed', failed_step: 'plan', duration_ms: 200 },
          { cycle_id: 'c5', started_at: '2026-03-16T02:00:00.000Z', result: 'success', duration_ms: 180 },
          { cycle_id: 'c6', started_at: '2026-03-16T01:00:00.000Z', result: 'failed', failed_step: 'route', duration_ms: 190 }
        ]
      }
    });

    expect(summary.regression_detected).toBe(true);
    expect(summary.regression_reasons.some((reason) => reason.startsWith('failed_step_concentration:'))).toBe(true);
  });
});
