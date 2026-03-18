import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const pipelineScript = path.join(repoRoot, 'scripts', 'managed-docs-pipeline.mjs');

const runPipeline = (args = []) =>
  spawnSync('node', [pipelineScript, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PLAYBOOK_MANAGED_DOCS_REPO_ROOT: repoRoot
    }
  });

test('docs pipeline regenerates stale managed docs before validating in check mode', { concurrency: false }, () => {
  const commandTruthPath = path.join(repoRoot, 'docs', 'contracts', 'command-truth.json');
  const original = fs.readFileSync(commandTruthPath, 'utf8');

  try {
    fs.writeFileSync(commandTruthPath, '{"commandTruth":[]}\n', 'utf8');
    const result = runPipeline(['--check']);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /roadmap-contract: ok/);
    assert.doesNotMatch(result.stderr, /unknown live command/);
    assert.match(result.stderr, /Managed docs are stale/);
  } finally {
    fs.writeFileSync(commandTruthPath, original, 'utf8');
  }
});

test('docs pipeline blocks promotion when validation fails after regeneration', { concurrency: false }, () => {
  const roadmapPath = path.join(repoRoot, 'docs', 'roadmap', 'ROADMAP.json');
  const commandTruthPath = path.join(repoRoot, 'docs', 'contracts', 'command-truth.json');
  const roadmapOriginal = fs.readFileSync(roadmapPath, 'utf8');
  const commandTruthOriginal = fs.readFileSync(commandTruthPath, 'utf8');

  try {
    const roadmap = JSON.parse(roadmapOriginal);
    const featureIndex = roadmap.features.findIndex((feature) => feature.version === 'v0.9' && ['implemented-hardening', 'in-progress'].includes(feature.status));
    assert.notEqual(featureIndex, -1);
    roadmap.features[featureIndex].commands = [...new Set([...(roadmap.features[featureIndex].commands ?? []), 'ghost-command'])];
    fs.writeFileSync(roadmapPath, JSON.stringify(roadmap, null, 2) + '\n', 'utf8');

    const result = runPipeline();
    const after = fs.readFileSync(commandTruthPath, 'utf8');

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown live command "ghost-command"/);
    assert.equal(after, commandTruthOriginal);
  } finally {
    fs.writeFileSync(roadmapPath, roadmapOriginal, 'utf8');
    fs.writeFileSync(commandTruthPath, commandTruthOriginal, 'utf8');
  }
});
