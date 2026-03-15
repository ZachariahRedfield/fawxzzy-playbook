import { describe, expect, it } from 'vitest';
import { buildWorksetPlan } from '../src/orchestration/worksetPlan.js';
import { deriveLaneState } from '../src/orchestration/laneState.js';

describe('deriveLaneState', () => {
  it('marks independent docs/cli lanes as ready', () => {
    const worksetPlan = buildWorksetPlan(
      process.cwd(),
      [
        { task_id: 'task-docs', task: 'update documentation and changelog' },
        { task_id: 'task-cli', task: 'add a new cli command flag' }
      ],
      './fixtures/tasks.json'
    );

    const laneState = deriveLaneState(worksetPlan, '.playbook/workset-plan.json');
    expect(laneState.ready_lanes.length).toBeGreaterThan(0);
    expect(laneState.blocked_lanes).toHaveLength(0);
  });

  it('keeps ambiguous blocked lane explicit', () => {
    const worksetPlan = buildWorksetPlan(
      process.cwd(),
      [{ task_id: 'task-ambiguous', task: 'update docs for cli command' }],
      './fixtures/tasks.json'
    );

    const laneState = deriveLaneState(worksetPlan, '.playbook/workset-plan.json');
    expect(laneState.blocked_lanes).toContain('blocked-task-ambiguous');
    expect(laneState.ready_lanes).toHaveLength(0);
  });

  it('dependency-ordered engine lane stays blocked until lower dependency lanes are satisfied', () => {
    const worksetPlan = buildWorksetPlan(
      process.cwd(),
      [
        { task_id: 'task-docs', task: 'update documentation changelog markdown' },
        { task_id: 'task-engine', task: 'adjust scoring fitness thresholds and engine behavior' }
      ],
      './fixtures/tasks.json'
    );

    const originalLowLane = worksetPlan.lanes.find((lane) => lane.dependency_level === 'low');
    if (originalLowLane) {
      originalLowLane.worker_ready = false;
    }

    const laneState = deriveLaneState(worksetPlan, '.playbook/workset-plan.json');
    const highOrMediumLane = laneState.lanes.find((lane) => lane.dependency_level !== 'low');
    expect(highOrMediumLane?.status).toBe('blocked');
    expect(highOrMediumLane?.blocked_reasons.join(' ')).toContain('waiting on dependency lane');
  });

  it('summarizes mixed blocked + ready lanes with conservative merge readiness', () => {
    const worksetPlan = buildWorksetPlan(
      process.cwd(),
      [
        { task_id: 'task-docs', task: 'update docs and changelog' },
        { task_id: 'task-engine', task: 'adjust scoring engine thresholds' },
        { task_id: 'task-ambiguous', task: 'update docs for cli command' }
      ],
      './fixtures/tasks.json'
    );

    const laneState = deriveLaneState(worksetPlan, '.playbook/workset-plan.json');
    expect(laneState.blocked_lanes.length).toBeGreaterThan(0);
    expect(laneState.ready_lanes.length).toBeGreaterThan(0);
    expect(laneState.merge_readiness.not_merge_ready_lanes.length).toBeGreaterThan(0);
  });
});
