const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMergeGuardSummary, renderMarkdown } = require('./render-verify-merge-guard-summary.cjs');

test('buildMergeGuardSummary compacts protected-doc verify evidence into canonical fields', () => {
  const summary = buildMergeGuardSummary({
    ok: false,
    findings: [
      {
        id: 'protected-doc.consolidation.blocked',
        evidence: 'decision=fail_closed; status=protected-doc consolidation blocked; affected_surfaces=docs/CHANGELOG.md, docs/PLAYBOOK_PRODUCT_ROADMAP.md; blockers=lane:lane-2; next_action=Resolve consolidation conflicts, then rerun `pnpm playbook docs consolidate --json`.'
      },
      {
        id: 'protected-doc.apply.drift-conflict',
        evidence: 'decision=fail_closed; status=guarded apply drift conflict; affected_surfaces=docs/CHANGELOG.md; blockers=proposal:docs-1; next_action=Regenerate the reviewed docs-consolidation-plan artifact before applying again.'
      },
      {
        id: 'notes.missing',
        evidence: 'decision=ignored'
      }
    ]
  });

  assert.deepEqual(summary, {
    findingIds: ['protected-doc.apply.drift-conflict', 'protected-doc.consolidation.blocked'],
    decision: 'fail_closed',
    status: 'guarded apply drift conflict · protected-doc consolidation blocked',
    affectedSurfaces: ['docs/CHANGELOG.md', 'docs/PLAYBOOK_PRODUCT_ROADMAP.md'],
    blockers: ['lane:lane-2', 'proposal:docs-1'],
    nextActions: [
      'Regenerate the reviewed docs-consolidation-plan artifact before applying again.',
      'Resolve consolidation conflicts, then rerun `pnpm playbook docs consolidate --json`.'
    ],
  });
});

test('renderMarkdown keeps the CI/PR summary compact', () => {
  const markdown = renderMarkdown({
    decision: 'fail_closed',
    status: 'protected-doc consolidation blocked',
    affectedSurfaces: ['docs/CHANGELOG.md'],
    blockers: ['lane:lane-2'],
    nextActions: ['Resolve consolidation conflicts, then rerun `pnpm playbook docs consolidate --json`.']
  }, { marker: '<!-- marker -->', title: 'Playbook Merge Guard' });

  assert.match(markdown, /Decision \/ status \| fail_closed \/ protected-doc consolidation blocked/);
  assert.match(markdown, /Affected surfaces \| docs\/CHANGELOG.md/);
  assert.match(markdown, /Blockers \| lane:lane-2/);
  assert.match(markdown, /Next action \| Resolve consolidation conflicts/);
});
