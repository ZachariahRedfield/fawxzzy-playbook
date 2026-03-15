import { describe, expect, it } from 'vitest';
import {
  normalizeOutcomeTelemetryArtifact,
  normalizeProcessTelemetryArtifact,
  summarizeStructuralTelemetry
} from '../src/telemetry/outcomeTelemetry.js';

describe('outcomeTelemetry', () => {
  it('normalizes records deterministically and recomputes rollups', () => {
    const artifact = normalizeOutcomeTelemetryArtifact({
      schemaVersion: '1.0',
      kind: 'outcome-telemetry',
      generatedAt: '2026-03-14T00:00:00.000Z',
      records: [
        {
          id: 'b',
          recordedAt: '2026-03-14T02:00:00.000Z',
          plan_churn: 1,
          apply_retries: 0,
          dependency_drift: 2,
          contract_breakage: 1,
          docs_mismatch: true,
          ci_failure_categories: ['flake', 'compile', 'flake'],
          task_profile_id: 'profile-docs',
          task_family: 'docs_only',
          affected_surfaces: ['docs', 'contracts', 'docs'],
          estimated_change_surface: 1,
          actual_change_surface: 1,
          files_changed_count: 2,
          post_apply_verify_passed: true,
          post_apply_ci_passed: true,
          regression_categories: ['none'],
          pattern_families_implicated: ['documentation']
        },
        {
          id: 'a',
          recordedAt: '2026-03-14T01:00:00.000Z',
          plan_churn: 3,
          apply_retries: 2,
          dependency_drift: 0,
          contract_breakage: 0,
          docs_mismatch: false,
          ci_failure_categories: ['lint'],
          task_profile_id: 'profile-engine',
          task_family: 'engine_scoring',
          affected_surfaces: ['engine'],
          estimated_change_surface: 4,
          actual_change_surface: 6,
          files_changed_count: 7,
          post_apply_verify_passed: true,
          post_apply_ci_passed: false,
          regression_categories: ['ci-gating'],
          pattern_families_implicated: ['scoring-model']
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
    });

    expect(artifact.records.map((record) => record.id)).toEqual(['a', 'b']);
    expect(artifact.records[1]?.ci_failure_categories).toEqual(['compile', 'flake']);
    expect(artifact.records[1]?.affected_surfaces).toEqual(['contracts', 'docs']);
    expect(artifact.summary).toEqual({
      total_records: 2,
      sum_plan_churn: 4,
      sum_apply_retries: 2,
      sum_dependency_drift: 2,
      sum_contract_breakage: 1,
      docs_mismatch_count: 1,
      ci_failure_category_counts: {
        compile: 1,
        flake: 1,
        lint: 1
      },
      task_family_counts: {
        docs_only: 1,
        engine_scoring: 1
      },
      affected_surface_counts: {
        contracts: 1,
        docs: 1,
        engine: 1
      },
      regression_category_counts: {
        'ci-gating': 1,
        none: 1
      },
      pattern_family_implicated_counts: {
        documentation: 1,
        'scoring-model': 1
      },
      post_apply_verify_passed_count: 2,
      post_apply_ci_passed_count: 1,
      sum_estimated_change_surface: 5,
      sum_actual_change_surface: 7,
      sum_files_changed_count: 9
    });
  });

  it('safely degrades partial telemetry records and remains backward compatible', () => {
    const artifact = normalizeOutcomeTelemetryArtifact({
      schemaVersion: '1.0',
      kind: 'outcome-telemetry',
      generatedAt: '',
      records: [
        {
          id: 'legacy',
          recordedAt: '2026-03-14T01:00:00.000Z',
          plan_churn: 1,
          apply_retries: 0,
          dependency_drift: 0,
          contract_breakage: 0,
          docs_mismatch: false,
          ci_failure_categories: ['lint']
        },
        {
          id: '',
          recordedAt: '',
          plan_churn: -2,
          apply_retries: -1,
          dependency_drift: -9,
          contract_breakage: -3,
          docs_mismatch: false,
          ci_failure_categories: [],
          task_profile_id: ' ',
          task_family: ' ',
          affected_surfaces: ['docs', '', 'docs'],
          estimated_change_surface: -3,
          actual_change_surface: -2,
          files_changed_count: -9,
          post_apply_verify_passed: false,
          post_apply_ci_passed: false,
          regression_categories: [' ', 'schema'],
          pattern_families_implicated: ['patterns', 'patterns']
        }
      ],
      summary: {
        total_records: 99,
        sum_plan_churn: 1,
        sum_apply_retries: 1,
        sum_dependency_drift: 1,
        sum_contract_breakage: 1,
        docs_mismatch_count: 1,
        ci_failure_category_counts: { stale: 1 }
      }
    });

    expect(artifact.generatedAt).toBe(new Date(0).toISOString());
    expect(artifact.records[0]).toEqual({
      id: 'unknown',
      recordedAt: new Date(0).toISOString(),
      plan_churn: 0,
      apply_retries: 0,
      dependency_drift: 0,
      contract_breakage: 0,
      docs_mismatch: false,
      ci_failure_categories: [],
      affected_surfaces: ['docs'],
      estimated_change_surface: 0,
      actual_change_surface: 0,
      files_changed_count: 0,
      post_apply_verify_passed: false,
      post_apply_ci_passed: false,
      regression_categories: ['schema'],
      pattern_families_implicated: ['patterns']
    });
    expect(artifact.summary.total_records).toBe(2);
    expect(artifact.summary.ci_failure_category_counts).toEqual({ lint: 1 });
  });

  it('computes process and combined telemetry summaries', () => {
    const process = normalizeProcessTelemetryArtifact({
      schemaVersion: '1.0',
      kind: 'process-telemetry',
      generatedAt: '2026-03-15T00:00:00.000Z',
      records: [
        {
          id: 'run-2',
          recordedAt: '2026-03-14T02:00:00.000Z',
          task_family: 'docs',
          task_duration_ms: 500,
          files_touched: ['README.md', 'README.md'],
          validators_run: ['pnpm test'],
          retry_count: 1,
          merge_conflict_risk: 0.35234,
          first_pass_success: false,
          prompt_size: 300,
          reasoning_scope: 'module'
        },
        {
          id: 'run-1',
          recordedAt: '2026-03-14T01:00:00.000Z',
          task_family: 'governance',
          task_duration_ms: 1500,
          files_touched: ['docs/contracts/OUTCOME_TELEMETRY.md'],
          validators_run: ['pnpm -r build', 'pnpm test'],
          retry_count: 0,
          merge_conflict_risk: 0.1,
          first_pass_success: true,
          prompt_size: 512,
          reasoning_scope: 'repository'
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
    });

    expect(process.records.map((record) => record.id)).toEqual(['run-1', 'run-2']);
    expect(process.summary.average_merge_conflict_risk).toBe(0.2262);
    expect(process.summary.validators_run_counts).toEqual({
      'pnpm -r build': 1,
      'pnpm test': 2
    });

    const outcome = normalizeOutcomeTelemetryArtifact({
      schemaVersion: '1.0',
      kind: 'outcome-telemetry',
      generatedAt: '2026-03-14T00:00:00.000Z',
      records: [],
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

    const summary = summarizeStructuralTelemetry(outcome, process);
    expect(summary.generatedAt).toBe('2026-03-15T00:00:00.000Z');
    expect(summary.process.total_records).toBe(2);
    expect(summary.outcomes.total_records).toBe(0);
  });
});
