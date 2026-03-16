import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateLearningCompactionArtifact } from './learningCompaction.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-learning-engine-'));

const writeArtifacts = (repo: string): void => {
  fs.mkdirSync(path.join(repo, '.playbook', 'memory', 'events'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, '.playbook', 'process-telemetry.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      kind: 'process-telemetry',
      generatedAt: '2026-03-15T00:00:00.000Z',
      records: [
        {
          id: 'proc-1',
          recordedAt: '2026-03-14T01:00:00.000Z',
          task_family: 'engine_scoring',
          route_id: 'deterministic_local:engine_scoring',
          task_duration_ms: 100,
          files_touched: ['a.md'],
          validators_run: ['pnpm test'],
          required_validations_selected: ['pnpm test'],
          retry_count: 2,
          merge_conflict_risk: 0.1,
          first_pass_success: false,
          prompt_size: 10,
          reasoning_scope: 'repository',
          over_validation_signal: true,
          validation_duration_ms: 30,
          parallel_lane_count: 2
        },
        {
          id: 'proc-2',
          recordedAt: '2026-03-14T02:00:00.000Z',
          task_family: 'docs_only',
          route_id: 'deterministic_local:docs_only',
          task_duration_ms: 50,
          files_touched: ['docs.md'],
          validators_run: ['pnpm playbook docs audit --json'],
          required_validations_selected: ['pnpm playbook docs audit --json'],
          retry_count: 0,
          merge_conflict_risk: 0.05,
          first_pass_success: true,
          prompt_size: 10,
          reasoning_scope: 'module',
          validation_duration_ms: 10,
          parallel_lane_count: 1
        }
      ],
      summary: {
        total_records: 0,
        total_task_duration_ms: 0,
        average_task_duration_ms: 0,
        total_retry_count: 0,
        first_pass_success_count: 0,
        average_merge_conflict_risk: 0,
        total_files_touched_unique: 0,
        total_validators_run_unique: 0,
        task_family_counts: {},
        validators_run_counts: {},
        reasoning_scope_counts: { narrow: 0, module: 0, repository: 0, 'cross-repo': 0 }
      }
    })
  );

  fs.writeFileSync(
    path.join(repo, '.playbook', 'outcome-telemetry.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      kind: 'outcome-telemetry',
      generatedAt: '2026-03-16T00:00:00.000Z',
      records: [
        {
          id: 'out-1',
          recordedAt: '2026-03-14T03:00:00.000Z',
          plan_churn: 1,
          apply_retries: 0,
          dependency_drift: 0,
          contract_breakage: 1,
          docs_mismatch: true,
          ci_failure_categories: ['lint'],
          task_family: 'engine_scoring'
        }
      ],
      summary: {
        total_records: 0,
        sum_plan_churn: 0,
        sum_apply_retries: 0,
        sum_dependency_drift: 0,
        sum_contract_breakage: 0,
        docs_mismatch_count: 0,
        ci_failure_category_counts: {}
      }
    })
  );

  fs.writeFileSync(
    path.join(repo, '.playbook', 'memory', 'events', 'a.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      event_type: 'execution_outcome',
      event_id: 'a',
      timestamp: '2026-03-14T04:00:00.000Z',
      subsystem: 'repository_memory',
      subject: 'lane-1',
      related_artifacts: [],
      run_id: 'run-1',
      payload: { lane_id: 'lane-1', outcome: 'success', summary: 'ok' },
      lane_id: 'lane-1',
      outcome: 'success',
      summary: 'ok'
    })
  );
};

describe('generateLearningCompactionArtifact', () => {
  it('aggregates repeated patterns deterministically', () => {
    const repo = createRepo();
    writeArtifacts(repo);

    const artifact = generateLearningCompactionArtifact(repo);

    expect(artifact.kind).toBe('learning-compaction');
    expect(artifact.summary.route_patterns.map((entry) => entry.route_id)).toEqual([
      'deterministic_local:docs_only',
      'deterministic_local:engine_scoring'
    ]);
    expect(artifact.summary.recurring_failures.some((entry) => entry.signal_id === 'failure.retry-heavy.engine_scoring')).toBe(true);
    expect(artifact.summary.recurring_successes.some((entry) => entry.signal_id === 'success.router-fit.high')).toBe(false);
  });

  it('degrades safely with partial artifacts', () => {
    const repo = createRepo();
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });

    const artifact = generateLearningCompactionArtifact(repo);

    expect(artifact.sourceArtifacts.processTelemetry.available).toBe(false);
    expect(artifact.summary.open_questions.length).toBeGreaterThan(0);
    expect(artifact.summary.time_window.start).toBe('1970-01-01T00:00:00.000Z');
  });
});
