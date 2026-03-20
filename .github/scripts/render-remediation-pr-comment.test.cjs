const test = require('node:test');
const assert = require('node:assert/strict');
const { renderRemediationComment } = require('./render-remediation-pr-comment.cjs');

test('renderRemediationComment renders canonical artifact fields from autofix and remediation-status artifacts', () => {
  const body = renderRemediationComment({
    policy: {
      status: 'allowed',
      mutation_allowed: true,
      reasons: [],
      artifact_paths: {
        failure_log_path: '.playbook/ci-failure.log',
        policy_path: '.playbook/ci-remediation-policy.json',
        autofix_result_path: '.playbook/test-autofix.json',
        remediation_status_path: '.playbook/remediation-status.json',
      },
    },
    autofix: {
      final_status: 'blocked',
      retry_policy_decision: 'blocked_repeat_failure',
      preferred_repair_class: 'snapshot_refresh',
      applied_task_ids: ['task-a', 'task-b'],
      stop_reasons: ['blocked_repeat_failure'],
      apply_result: { attempted: false, ok: false },
      verification_result: { attempted: false, ok: false },
      source_triage: { path: '.playbook/test-triage.json' },
      source_fix_plan: { path: '.playbook/test-fix-plan.json' },
      source_apply: { path: '.playbook/test-autofix-apply.json' },
      remediation_history_path: '.playbook/test-autofix-history.json',
    },
    remediationStatus: {
      blocked_signatures: ['sig-a'],
      review_required_signatures: ['sig-b'],
    },
  });

  assert.match(body, /Final status \| blocked/);
  assert.match(body, /Retry policy decision \| blocked_repeat_failure/);
  assert.match(body, /Preferred repair class \| snapshot_refresh/);
  assert.match(body, /task-a/);
  assert.match(body, /sig-a/);
  assert.match(body, /\.playbook\/test-autofix-history\.json/);
});

test('renderRemediationComment surfaces blocked-by-policy state when mutation gates fail closed', () => {
  const body = renderRemediationComment({
    policy: {
      status: 'blocked_by_policy',
      mutation_allowed: false,
      reasons: ['autofix disabled by workflow input'],
      artifact_paths: {
        failure_log_path: '.playbook/ci-failure.log',
        policy_path: '.playbook/ci-remediation-policy.json',
      },
    },
    autofix: null,
    remediationStatus: null,
  });

  assert.match(body, /Final status \| blocked_by_policy/);
  assert.match(body, /Mutation gate \| blocked/);
  assert.match(body, /autofix disabled by workflow input/);
  assert.match(body, /failure_log/);
});
