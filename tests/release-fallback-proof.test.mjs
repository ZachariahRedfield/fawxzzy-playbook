import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  evaluateArtifactContracts,
  evaluateTarballEntries,
  parseTarEntries
} from '../scripts/release-fallback-proof.mjs';

const withTempRepo = (fn) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'release-fallback-proof-test-'));
  try {
    mkdirSync(path.join(root, '.playbook'), { recursive: true });
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const contracts = [
  {
    path: '.playbook/repo-graph.json',
    producerKey: 'index',
    producerCommand: 'npx playbook index --json',
    remediation: 'run index',
    severity: 'setup_precondition_fail',
    schema: { kind: 'repo-graph' }
  },
  {
    path: '.playbook/last-run.json',
    producerKey: 'apply',
    producerCommand: 'npx playbook apply --json',
    remediation: 'run apply',
    severity: 'hard_fail'
  }
];

test('flags missing both artifacts as missing prerequisites', () => {
  withTempRepo((repoRoot) => {
    const checks = evaluateArtifactContracts({ repoRoot, contracts, producerRuns: {} });
    assert.equal(checks.length, 2);
    assert.equal(checks[0].ok, false);
    assert.equal(checks[1].ok, false);
    assert.equal(checks[0].failureType, 'missing_prerequisite_artifact');
    assert.equal(checks[1].failureType, 'missing_prerequisite_artifact');
  });
});

test('flags missing repo-graph when last-run exists', () => {
  withTempRepo((repoRoot) => {
    writeFileSync(path.join(repoRoot, '.playbook', 'last-run.json'), JSON.stringify({ command: 'apply' }, null, 2));
    const checks = evaluateArtifactContracts({ repoRoot, contracts, producerRuns: {} });
    assert.equal(checks[0].failureType, 'missing_prerequisite_artifact');
    assert.equal(checks[1].ok, true);
  });
});

test('flags missing last-run when repo-graph exists', () => {
  withTempRepo((repoRoot) => {
    writeFileSync(path.join(repoRoot, '.playbook', 'repo-graph.json'), JSON.stringify({ edges: [] }, null, 2));
    const checks = evaluateArtifactContracts({ repoRoot, contracts, producerRuns: {} });
    assert.equal(checks[0].ok, true);
    assert.equal(checks[1].failureType, 'missing_prerequisite_artifact');
  });
});

test('passes when artifacts are present and valid', () => {
  withTempRepo((repoRoot) => {
    writeFileSync(path.join(repoRoot, '.playbook', 'repo-graph.json'), JSON.stringify({ edges: [] }, null, 2));
    writeFileSync(path.join(repoRoot, '.playbook', 'last-run.json'), JSON.stringify({ command: 'apply' }, null, 2));
    const checks = evaluateArtifactContracts({ repoRoot, contracts, producerRuns: {} });
    assert.ok(checks.every((check) => check.ok));
  });
});

test('check shape is stable and includes remediation metadata on failure', () => {
  withTempRepo((repoRoot) => {
    const checks = evaluateArtifactContracts({ repoRoot, contracts, producerRuns: {} });
    for (const check of checks) {
      assert.ok('artifactPath' in check);
      assert.ok('failureType' in check);
      assert.ok('expectedProducerCommand' in check);
      assert.ok('remediation' in check);
      assert.ok('severity' in check);
      assert.equal(typeof check.remediation, 'string');
      assert.match(check.command, /^node artifact-exists-check /);
    }
  });
});

test('parseTarEntries normalizes CRLF output and preserves exact entries', () => {
  assert.deepEqual(parseTarEntries('package/bin/playbook.js\r\npackage/runtime/main.js\r\n'), [
    'package/bin/playbook.js',
    'package/runtime/main.js'
  ]);
});

test('evaluateTarballEntries validates exact entries and vendored runtime in JS', () => {
  const checks = evaluateTarballEntries({
    tarPath: 'dist/release/playbook-cli-0.1.8.tgz',
    tarEntries: [
      'package/bin/playbook.js',
      'package/runtime/main.js',
      'package/runtime/node_modules/foo/index.js'
    ]
  });

  assert.equal(checks.length, 3);
  assert.ok(checks.every((check) => check.ok));
  assert.match(checks[0].command, /^node tar-entry-check /);
  assert.match(checks[2].command, /^node tar-entry-prefix-check /);
});
