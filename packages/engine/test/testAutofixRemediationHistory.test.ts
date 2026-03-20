import { describe, expect, it } from 'vitest';
import { buildTestTriageArtifact } from '../src/testTriage.js';
import {
  appendRemediationHistoryEntry,
  createEmptyRemediationHistoryArtifact,
  listPriorSuccessfulRepairClasses,
  listRepeatedFailedRepairAttempts,
  listRunsByFailureSignature,
  nextRemediationHistoryRunId
} from '../src/testAutofix/remediationHistory.js';

describe('test-autofix remediation history helpers', () => {
  it('derives the same failure signature for equivalent reruns with line noise differences', () => {
    const first = buildTestTriageArtifact([
      '@fawxzzy/playbook test: FAIL  packages/cli/src/commands/schema.test.ts',
      '  × renders schema snapshot',
      '    Snapshot `renders schema snapshot 1` mismatch',
      '    Expected: "alpha beta"',
      '    Received: "alpha   beta"'
    ].join('\n'), { input: 'file', path: 'failure.log' });

    const second = buildTestTriageArtifact([
      '@fawxzzy/playbook test: FAIL  packages/cli/src/commands/schema.test.ts',
      '  × renders schema snapshot ',
      '    Snapshot `renders schema snapshot 2` mismatch',
      '    Expected: "alpha beta"',
      '    Received: "alpha beta"'
    ].join('\n'), { input: 'file', path: 'failure.log' });

    expect(first.findings[0]?.failure_signature).toBe(second.findings[0]?.failure_signature);
  });

  it('records history and supports repeated-failure lookup', () => {
    const triage = buildTestTriageArtifact([
      '@fawxzzy/playbook test: FAIL  packages/cli/src/commands/schema.test.ts',
      '  × renders schema snapshot',
      '    Snapshot `renders schema snapshot 1` mismatch'
    ].join('\n'), { input: 'file', path: 'failure.log' });
    const signature = triage.findings[0]?.failure_signature;
    expect(signature).toBeTruthy();

    const base = createEmptyRemediationHistoryArtifact();
    expect(nextRemediationHistoryRunId(base)).toBe('test-autofix-run-0001');

    const success = appendRemediationHistoryEntry(base, {
      run_id: 'test-autofix-run-0001',
      generatedAt: new Date(0).toISOString(),
      input: { path: 'failure.log' },
      failure_signatures: [signature!],
      triage_classifications: [{
        failure_signature: signature!, failure_kind: 'snapshot_drift', repair_class: 'autofix_plan_only', package: '@fawxzzy/playbook', test_file: 'packages/cli/src/commands/schema.test.ts', test_name: 'renders schema snapshot'
      }],
      admitted_findings: [signature!],
      excluded_findings: [],
      applied_task_ids: ['task-1'],
      applied_repair_classes: ['snapshot_refresh'],
      files_touched: ['packages/cli/src/commands/schema.test.ts'],
      verification_commands: ['pnpm -r test'],
      verification_outcomes: [{ command: 'pnpm -r test', exitCode: 0, ok: true }],
      final_status: 'fixed',
      stop_reasons: ['Verification passed after apply.'],
      provenance: { failure_log_path: 'failure.log', triage_artifact_path: '.playbook/test-triage.json', fix_plan_artifact_path: '.playbook/test-fix-plan.json', apply_result_path: '.playbook/test-autofix-apply.json', autofix_result_path: '.playbook/test-autofix.json' }
    });
    const failed = appendRemediationHistoryEntry(success, {
      run_id: 'test-autofix-run-0002',
      generatedAt: new Date(0).toISOString(),
      input: { path: 'failure.log' },
      failure_signatures: [signature!],
      triage_classifications: [{
        failure_signature: signature!, failure_kind: 'snapshot_drift', repair_class: 'autofix_plan_only', package: '@fawxzzy/playbook', test_file: 'packages/cli/src/commands/schema.test.ts', test_name: 'renders schema snapshot'
      }],
      admitted_findings: [signature!],
      excluded_findings: [],
      applied_task_ids: ['task-1'],
      applied_repair_classes: ['snapshot_refresh'],
      files_touched: ['packages/cli/src/commands/schema.test.ts'],
      verification_commands: ['pnpm -r test'],
      verification_outcomes: [{ command: 'pnpm -r test', exitCode: 1, ok: false }],
      final_status: 'not_fixed',
      stop_reasons: ['Verification still failed.'],
      provenance: { failure_log_path: 'failure.log', triage_artifact_path: '.playbook/test-triage.json', fix_plan_artifact_path: '.playbook/test-fix-plan.json', apply_result_path: '.playbook/test-autofix-apply.json', autofix_result_path: '.playbook/test-autofix.json' }
    });

    expect(listRunsByFailureSignature(failed, signature!)).toHaveLength(2);
    expect(listPriorSuccessfulRepairClasses(failed, signature!)).toEqual(['snapshot_refresh']);
    expect(listRepeatedFailedRepairAttempts(failed, signature!)).toHaveLength(1);
  });
});
