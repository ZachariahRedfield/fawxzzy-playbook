const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSummary, renderMarkdown } = require('./render-playbook-ci-summary.cjs');

test('buildSummary renders compact success summary with verify, release, and merge-guard sections', () => {
  const summary = buildSummary({
    verify: {
      ok: true,
      findings: [
        {
          id: 'protected-doc.governance',
          evidence: 'decision=pass; status=clear; affected_surfaces=none; blockers=none; next_action=No protected-doc action required.'
        }
      ],
      nextActions: ['No verify follow-up required.']
    },
    releasePlan: {
      summary: { recommendedBump: 'minor' },
      packages: [{ name: '@scope/alpha', currentVersion: '1.2.3', recommendedBump: 'minor' }],
      versionGroups: []
    },
    remediationPolicy: null,
    failureSummary: null,
    remediationStatus: null,
  });

  assert.equal(summary.overall.status, 'clear');
  assert.equal(summary.verify.status, 'PASS');
  assert.equal(summary.release.recommendedBump, 'minor');
  assert.equal(summary.mergeGuard.status, 'clear');
  assert.equal(summary.remediation, null);
});

test('buildSummary includes remediation only when a test failure artifact exists', () => {
  const summary = buildSummary({
    verify: {
      ok: false,
      findings: [{ id: 'rule.test', level: 'error', message: 'tests failed' }],
      nextActions: ['Run pnpm test after remediation.']
    },
    releasePlan: null,
    remediationPolicy: {
      status: 'blocked_by_policy',
      reasons: ['autofix disabled by workflow input'],
    },
    failureSummary: {
      primaryFailureClass: 'vitest_assertion',
      summary: { totalFailures: 3 },
    },
    remediationStatus: {
      latest_run: {
        final_status: 'blocked_low_confidence',
        retry_policy_decision: 'hold',
        preferred_repair_class: 'snapshot_refresh',
      }
    },
  });

  assert.equal(summary.overall.status, 'blocked · test failure');
  assert.equal(summary.remediation.status, 'blocked_low_confidence');
  assert.equal(summary.remediation.failureClass, 'vitest_assertion');
  assert.equal(summary.remediation.failureCount, 3);
  assert.equal(summary.remediation.nextAction, 'autofix disabled by workflow input');
});

test('renderMarkdown uses one compact operator brief', () => {
  const markdown = renderMarkdown({
    overall: { decision: 'verify blocked', status: 'blocked · test failure' },
    verify: { status: 'FAIL', blockers: ['rule.test: tests failed'], nextAction: 'Run pnpm test after remediation.' },
    mergeGuard: { decision: 'fail_closed', status: 'merge guard blocked', blockers: ['lane:docs'], nextAction: 'Resolve docs lane.' },
    release: { recommendedBump: 'patch', status: 'release plan ready', currentVersion: '1.2.3', nextVersion: '1.2.4', affected: '@scope/alpha' },
    remediation: { status: 'blocked_low_confidence', failureClass: 'vitest_assertion', failureCount: 2, retryDecision: 'hold', preferredRepairClass: 'snapshot_refresh', nextAction: 'Manual review required.' },
  }, { marker: '<!-- marker -->', title: 'Playbook CI Summary' });

  assert.match(markdown, /Overall decision \/ status \| verify blocked \/ blocked · test failure/);
  assert.match(markdown, /Verify blockers \| rule\.test: tests failed/);
  assert.match(markdown, /Merge guard \| fail_closed \/ merge guard blocked/);
  assert.match(markdown, /Release bump \| patch \/ release plan ready/);
  assert.match(markdown, /Remediation \| blocked_low_confidence/);
  assert.match(markdown, /Artifacts: `\.playbook\/verify\.json`, `\.playbook\/release-plan\.json`/);
});
