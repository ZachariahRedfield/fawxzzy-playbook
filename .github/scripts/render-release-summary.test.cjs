const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReleaseSummary, renderMarkdown } = require('./render-release-summary.cjs');

test('buildReleaseSummary reports no-op release plans compactly', () => {
  const summary = buildReleaseSummary({
    summary: { recommendedBump: 'none', reasons: ['docs/tests/CI-only surface changed'] },
    packages: [
      { name: '@scope/alpha', currentVersion: '1.2.3', recommendedBump: 'none' },
      { name: '@scope/beta', currentVersion: '1.2.3', recommendedBump: 'none' },
    ],
    versionGroups: [{ name: 'lockstep', packages: ['@scope/alpha', '@scope/beta'], recommendedBump: 'none' }],
  });

  assert.deepEqual(summary, {
    decision: 'none',
    status: 'no release-relevant diff',
    currentVersion: '1.2.3',
    recommendedBump: 'none',
    nextVersion: '(none)',
    affected: '(none)',
    nextAction: 'No version mutation required in normal PR CI; keep `pnpm playbook verify --json` as the merge gate.',
  });
});

test('buildReleaseSummary compacts lockstep minor bumps from the canonical plan artifact', () => {
  const summary = buildReleaseSummary({
    summary: { recommendedBump: 'minor', reasons: ['stable contract expansion changed'] },
    packages: [
      { name: '@scope/alpha', currentVersion: '1.2.3', recommendedBump: 'minor' },
      { name: '@scope/beta', currentVersion: '1.2.3', recommendedBump: 'minor' },
    ],
    versionGroups: [{ name: 'lockstep', packages: ['@scope/alpha', '@scope/beta'], recommendedBump: 'minor' }],
  });

  assert.deepEqual(summary, {
    decision: 'plan_only',
    status: 'release plan ready',
    currentVersion: '1.2.3',
    recommendedBump: 'minor',
    nextVersion: '1.3.0',
    affected: 'lockstep (@scope/alpha, @scope/beta)',
    nextAction: 'Review `.playbook/release-plan.json`; apply only through `pnpm playbook apply --from-plan .playbook/release-plan.json` in a reviewed boundary.',
  });
});

test('renderMarkdown keeps the release summary compact and artifact-backed', () => {
  const markdown = renderMarkdown({
    decision: 'plan_only',
    status: 'release plan ready',
    currentVersion: '1.2.3',
    recommendedBump: 'minor',
    nextVersion: '1.3.0',
    affected: 'lockstep (@scope/alpha, @scope/beta)',
    nextAction: 'Review `.playbook/release-plan.json`; apply only through `pnpm playbook apply --from-plan .playbook/release-plan.json` in a reviewed boundary.',
  }, { marker: '<!-- marker -->', title: 'Playbook Release Summary' });

  assert.match(markdown, /Decision \/ status \| plan_only \/ release plan ready/);
  assert.match(markdown, /Current version \| 1\.2\.3/);
  assert.match(markdown, /Recommended bump \| minor/);
  assert.match(markdown, /Next version \| 1\.3\.0/);
  assert.match(markdown, /Affected packages \/ version group \| lockstep \(@scope\/alpha, @scope\/beta\)/);
  assert.match(markdown, /Artifact: `\.playbook\/release-plan\.json`\./);
});
