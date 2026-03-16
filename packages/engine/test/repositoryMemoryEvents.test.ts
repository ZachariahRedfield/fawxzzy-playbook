import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readRepositoryEvents,
  recordImprovementSignal,
  recordExecutionOutcome,
  recordLaneTransition,
  recordRouteDecision,
  recordWorkerAssignment
} from '../src/index.js';

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;

describe('repository memory events', () => {
  it('records normalized deterministic events and updates index totals', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-repository-events-'));

    const route = recordRouteDecision(root, {
      timestamp: '2026-02-01T00:00:00.000Z',
      task_text: 'Route a deterministic task',
      task_family: 'governance',
      route_id: 'proposal-only',
      confidence: 0.9234567,
      related_artifacts: [{ path: '.playbook/execution-plan.json', kind: 'execution_plan' }]
    });

    const laneTransition = recordLaneTransition(root, {
      timestamp: '2026-02-01T00:00:01.000Z',
      lane_id: 'lane-a',
      from_state: 'planned',
      to_state: 'ready'
    });

    const assignment = recordWorkerAssignment(root, {
      timestamp: '2026-02-01T00:00:02.000Z',
      lane_id: 'lane-a',
      worker_id: 'worker-lane-a',
      assignment_status: 'assigned',
      assigned_prompt: '.playbook/prompts/lane-a.md'
    });

    const outcome = recordExecutionOutcome(root, {
      timestamp: '2026-02-01T00:00:03.000Z',
      lane_id: 'lane-a',
      outcome: 'success',
      summary: 'worker completed deterministic handoff'
    });

    const improvement = recordImprovementSignal(root, {
      timestamp: '2026-02-01T00:00:04.000Z',
      candidate_id: 'candidate-1',
      source: 'patterns.candidates',
      summary: 'Detected reusable deterministic improvement candidate',
      confidence: 0.7777777
    });

    const eventsDir = path.join(root, '.playbook', 'memory', 'events');
    const events = fs.readdirSync(eventsDir).filter((entry) => entry.endsWith('.json')).sort((a, b) => a.localeCompare(b));
    expect(events.length).toBe(5);

    const routePayload = readJson<{
      event_type: string;
      payload: { confidence: number };
      subsystem: string;
      related_artifacts: Array<{ path: string; kind?: string }>;
    }>(path.join(eventsDir, `${route.event_id}.json`));
    expect(routePayload.event_type).toBe('route_decision');
    expect(routePayload.payload.confidence).toBe(0.923457);
    expect(routePayload.subsystem).toBe('repository_memory');
    expect(routePayload.related_artifacts).toEqual([{ path: '.playbook/execution-plan.json', kind: 'execution_plan' }]);

    const index = readJson<{
      total_events: number;
      by_event_type: Record<string, { count: number; latest_timestamp: string | null }>;
    }>(path.join(root, '.playbook', 'memory', 'index.json'));

    expect(index.total_events).toBe(5);
    expect(index.by_event_type.route_decision).toEqual({ count: 1, latest_timestamp: '2026-02-01T00:00:00.000Z' });
    expect(index.by_event_type.lane_transition).toEqual({ count: 1, latest_timestamp: '2026-02-01T00:00:01.000Z' });
    expect(index.by_event_type.worker_assignment).toEqual({ count: 1, latest_timestamp: '2026-02-01T00:00:02.000Z' });
    expect(index.by_event_type.execution_outcome).toEqual({ count: 1, latest_timestamp: '2026-02-01T00:00:03.000Z' });
    expect(index.by_event_type.improvement_signal).toEqual({ count: 1, latest_timestamp: '2026-02-01T00:00:04.000Z' });

    expect(laneTransition.event_type).toBe('lane_transition');
    expect(assignment.event_type).toBe('worker_assignment');
    expect(outcome.event_type).toBe('execution_outcome');
    expect(improvement.event_type).toBe('improvement_signal');
  });

  it('reads normalized events in deterministic order with optional filters', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-repository-events-read-'));

    recordLaneTransition(root, {
      timestamp: '2026-02-01T00:00:02.000Z',
      lane_id: 'lane-a',
      from_state: 'planned',
      to_state: 'ready',
      run_id: 'run-1'
    });

    recordLaneTransition(root, {
      timestamp: '2026-02-01T00:00:01.000Z',
      lane_id: 'lane-b',
      from_state: 'planned',
      to_state: 'blocked',
      run_id: 'run-2'
    });

    const asc = readRepositoryEvents(root, { order: 'asc' });
    expect(asc.map((entry) => entry.subject)).toEqual(['lane-b', 'lane-a']);

    const byRun = readRepositoryEvents(root, { runId: 'run-1' });
    expect(byRun).toHaveLength(1);
    expect(byRun[0]?.payload).toMatchObject({ lane_id: 'lane-a' });
  });

  it('handles missing optional fields safely', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-repository-events-optional-'));

    const event = recordImprovementSignal(root, {
      timestamp: '2026-02-01T00:00:04.000Z',
      candidate_id: 'candidate-1',
      source: 'patterns.candidates',
      summary: 'Detected reusable deterministic improvement candidate'
    });

    const payload = readJson<{
      run_id?: string;
      payload: { confidence?: number };
      related_artifacts: unknown[];
    }>(path.join(root, '.playbook', 'memory', 'events', `${event.event_id}.json`));

    expect(payload.run_id).toBeUndefined();
    expect(payload.payload.confidence).toBeUndefined();
    expect(payload.related_artifacts).toEqual([]);
  });
});
