import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateRouterRecommendations } from './routerRecommendationEngine.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-router-recommendations-'));

const writeJson = (repo: string, relativePath: string, payload: unknown): void => {
  const fullPath = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2));
};

const writeLearningState = (repo: string, confidence = 0.85, validationCostPressure = 0.3): void => {
  writeJson(repo, '.playbook/learning-state.json', {
    schemaVersion: '1.0',
    kind: 'learning-state-snapshot',
    generatedAt: '2026-01-01T00:00:00.000Z',
    proposalOnly: true,
    sourceArtifacts: {
      outcomeTelemetry: { available: true, recordCount: 1, artifactPath: '.playbook/outcome-telemetry.json' },
      processTelemetry: { available: true, recordCount: 1, artifactPath: '.playbook/process-telemetry.json' },
      taskExecutionProfile: { available: true, recordCount: 1, artifactPath: '.playbook/task-execution-profile.json' }
    },
    metrics: {
      sample_size: 10,
      first_pass_yield: 0.8,
      retry_pressure: { docs_only: 0.2 },
      validation_load_ratio: 0.3,
      route_efficiency_score: { docs_only: 0.7 },
      smallest_sufficient_route_score: 0.75,
      parallel_safety_realized: 0.85,
      router_fit_score: 0.72,
      reasoning_scope_efficiency: 0.82,
      validation_cost_pressure: validationCostPressure,
      pattern_family_effectiveness_score: { docs_only: 0.7 },
      portability_confidence: 0.8
    },
    confidenceSummary: {
      sample_size_score: 0.8,
      coverage_score: 0.8,
      evidence_completeness_score: 0.85,
      overall_confidence: confidence,
      open_questions: []
    }
  });
};

const writeProcessTelemetry = (repo: string, records: Array<Record<string, unknown>>): void => {
  writeJson(repo, '.playbook/process-telemetry.json', {
    schemaVersion: '1.0',
    kind: 'process-telemetry',
    generatedAt: '2026-01-01T00:00:00.000Z',
    records,
    summary: {
      total_records: records.length,
      total_task_duration_ms: 100,
      average_task_duration_ms: 10,
      total_retry_count: 0,
      first_pass_success_count: records.length,
      average_merge_conflict_risk: 0,
      total_files_touched_unique: 1,
      total_validators_run_unique: 1,
      task_family_counts: { docs_only: records.length },
      validators_run_counts: {},
      reasoning_scope_counts: { narrow: records.length, module: 0, repository: 0, 'cross-repo': 0 },
      route_id_counts: { docs_default: records.length },
      task_profile_id_counts: {},
      rule_packs_selected_counts: {},
      required_validations_selected_counts: {},
      optional_validations_selected_counts: {},
      total_validation_duration_ms: 10,
      total_planning_duration_ms: 10,
      total_apply_duration_ms: 10,
      human_intervention_required_count: 0,
      actual_merge_conflict_count: 0,
      average_parallel_lane_count: 1,
      over_validation_signal_count: 0,
      under_validation_signal_count: 0,
      router_accuracy_records: records.length,
      average_router_fit_score: 0.7,
      average_lane_delta: 1,
      average_validation_delta: 1
    }
  });
};

const writeOutcomeTelemetry = (repo: string): void => {
  writeJson(repo, '.playbook/outcome-telemetry.json', {
    schemaVersion: '1.0',
    kind: 'outcome-telemetry',
    generatedAt: '2026-01-01T00:00:00.000Z',
    records: [],
    lane_scores: [],
    summary: {
      total_records: 0,
      sum_plan_churn: 0,
      sum_apply_retries: 0,
      sum_dependency_drift: 0,
      sum_contract_breakage: 0,
      docs_mismatch_count: 0,
      ci_failure_category_counts: {}
    }
  });
};

const writeEvent = (repo: string, fileName: string, payload: Record<string, unknown>): void => {
  writeJson(repo, `.playbook/memory/events/${fileName}.json`, payload);
};

describe('router recommendation engine', () => {
  it('emits repeated over-fragmentation recommendation', () => {
    const repo = createRepo();
    writeLearningState(repo, 0.9, 0.2);
    writeOutcomeTelemetry(repo);
    writeProcessTelemetry(
      repo,
      Array.from({ length: 3 }, (_, index) => ({
        id: `run-${index}`,
        recordedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        task_family: 'docs_only',
        route_id: 'docs_default',
        task_duration_ms: 100,
        files_touched: ['docs/README.md'],
        validators_run: ['docs-audit'],
        retry_count: 0,
        merge_conflict_risk: 0,
        first_pass_success: true,
        prompt_size: 20,
        reasoning_scope: 'narrow',
        predicted_parallel_lanes: 3,
        actual_parallel_lanes: 1,
        predicted_validation_cost: 2,
        actual_validation_cost: 2,
        router_fit_score: 0.5
      }))
    );

    const artifact = generateRouterRecommendations(repo);
    const recommendation = artifact.recommendations.find((entry) => entry.recommended_strategy === 'reduce_parallel_fragmentation');

    expect(recommendation).toBeDefined();
    expect(recommendation?.evidence_count).toBe(3);
    expect(recommendation?.task_family).toBe('docs_only');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('emits repeated under-fragmentation recommendation', () => {
    const repo = createRepo();
    writeLearningState(repo, 0.88, 0.2);
    writeOutcomeTelemetry(repo);
    writeProcessTelemetry(
      repo,
      Array.from({ length: 3 }, (_, index) => ({
        id: `run-${index}`,
        recordedAt: `2026-02-0${index + 1}T00:00:00.000Z`,
        task_family: 'contracts_schema',
        route_id: 'contracts_default',
        task_duration_ms: 100,
        files_touched: ['docs/ARCHITECTURE.md'],
        validators_run: ['pnpm -r build'],
        retry_count: 0,
        merge_conflict_risk: 0,
        first_pass_success: true,
        prompt_size: 20,
        reasoning_scope: 'module',
        predicted_parallel_lanes: 1,
        actual_parallel_lanes: 3,
        predicted_validation_cost: 2,
        actual_validation_cost: 2,
        router_fit_score: 0.45
      }))
    );

    const artifact = generateRouterRecommendations(repo);
    const recommendation = artifact.recommendations.find((entry) => entry.recommended_strategy === 'increase_parallel_fragmentation');

    expect(recommendation).toBeDefined();
    expect(recommendation?.task_family).toBe('contracts_schema');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('rejects recommendation when evidence is insufficient', () => {
    const repo = createRepo();
    writeLearningState(repo, 0.9, 0.2);
    writeOutcomeTelemetry(repo);
    writeProcessTelemetry(repo, [
      {
        id: 'run-1',
        recordedAt: '2026-03-01T00:00:00.000Z',
        task_family: 'docs_only',
        route_id: 'docs_default',
        task_duration_ms: 100,
        files_touched: ['docs/README.md'],
        validators_run: ['docs-audit'],
        retry_count: 0,
        merge_conflict_risk: 0,
        first_pass_success: true,
        prompt_size: 20,
        reasoning_scope: 'narrow',
        predicted_parallel_lanes: 3,
        actual_parallel_lanes: 1,
        predicted_validation_cost: 2,
        actual_validation_cost: 2,
        router_fit_score: 0.4
      },
      {
        id: 'run-2',
        recordedAt: '2026-03-01T00:05:00.000Z',
        task_family: 'docs_only',
        route_id: 'docs_default',
        task_duration_ms: 100,
        files_touched: ['docs/README.md'],
        validators_run: ['docs-audit'],
        retry_count: 0,
        merge_conflict_risk: 0,
        first_pass_success: true,
        prompt_size: 20,
        reasoning_scope: 'narrow',
        predicted_parallel_lanes: 3,
        actual_parallel_lanes: 1,
        predicted_validation_cost: 2,
        actual_validation_cost: 2,
        router_fit_score: 0.4
      }
    ]);

    const artifact = generateRouterRecommendations(repo);

    expect(artifact.recommendations).toHaveLength(0);
    expect(artifact.rejected_recommendations.length).toBeGreaterThan(0);
    expect(artifact.rejected_recommendations[0]?.rejection_reasons.some((entry) => entry.includes('insufficient_supporting_runs'))).toBe(
      true
    );

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('marks validation posture recommendation as governance-gated', () => {
    const repo = createRepo();
    writeLearningState(repo, 0.9, 0.85);
    writeOutcomeTelemetry(repo);
    writeProcessTelemetry(
      repo,
      Array.from({ length: 3 }, (_, index) => ({
        id: `lane-${index}`,
        recordedAt: `2026-04-0${index + 1}T00:00:00.000Z`,
        task_family: 'docs_only',
        route_id: 'docs_default',
        task_duration_ms: 100,
        files_touched: ['docs/README.md'],
        validators_run: ['docs-audit'],
        retry_count: 0,
        merge_conflict_risk: 0,
        first_pass_success: true,
        prompt_size: 20,
        reasoning_scope: 'narrow',
        predicted_parallel_lanes: 2,
        actual_parallel_lanes: 1,
        predicted_validation_cost: 1,
        actual_validation_cost: 4,
        router_fit_score: 0.5
      }))
    );
    for (let i = 0; i < 3; i += 1) {
      writeEvent(repo, `execution-${i}`, {
        schemaVersion: '1.0',
        event_type: 'execution_outcome',
        event_id: `execution-${i}`,
        timestamp: `2026-04-0${i + 1}T00:00:00.000Z`,
        subsystem: 'repository_memory',
        subject: `lane-${i}`,
        related_artifacts: [],
        payload: {
          lane_id: `lane-${i}`,
          outcome: 'success',
          summary: 'success'
        },
        lane_id: `lane-${i}`,
        outcome: 'success',
        summary: 'success'
      });
      writeEvent(repo, `route-${i}`, {
        schemaVersion: '1.0',
        event_type: 'route_decision',
        event_id: `route-${i}`,
        timestamp: `2026-04-0${i + 1}T00:00:00.000Z`,
        subsystem: 'repository_memory',
        subject: 'docs_default',
        related_artifacts: [],
        payload: {
          task_text: 'docs task',
          task_family: 'docs_only',
          route_id: 'docs_default',
          confidence: 0.9
        },
        task_text: 'docs task',
        task_family: 'docs_only',
        route_id: 'docs_default',
        confidence: 0.9
      });
    }

    const artifact = generateRouterRecommendations(repo);
    const recommendation = artifact.recommendations.find((entry) => entry.recommended_strategy === 'rebalance_validation_posture');

    expect(recommendation).toBeDefined();
    expect(recommendation?.gating_tier).toBe('GOVERNANCE');

    fs.rmSync(repo, { recursive: true, force: true });
  });
});
