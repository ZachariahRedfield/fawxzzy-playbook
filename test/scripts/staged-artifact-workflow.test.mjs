import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promoteStagedDirectory, promoteStagedFiles, withTempDir } from '../../scripts/staged-artifact-workflow.mjs';

const write = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

test('promoteStagedFiles restores original committed outputs when promotion fails mid-flight', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-staged-files-'));
  try {
    const destinationRoot = path.join(root, 'repo');
    const stageRoot = path.join(root, 'stage');
    write(path.join(destinationRoot, 'artifacts', 'one.txt'), 'original-one\n');
    write(path.join(destinationRoot, 'artifacts', 'two.txt'), 'original-two\n');
    write(path.join(stageRoot, 'artifacts', 'one.txt'), 'next-one\n');

    await assert.rejects(
      () => promoteStagedFiles({
        stageRoot,
        relativePaths: ['artifacts/one.txt', 'artifacts/two.txt'],
        destinationRoot
      }),
      /Missing staged file artifacts\/two.txt/
    );

    assert.equal(fs.readFileSync(path.join(destinationRoot, 'artifacts', 'one.txt'), 'utf8'), 'original-one\n');
    assert.equal(fs.readFileSync(path.join(destinationRoot, 'artifacts', 'two.txt'), 'utf8'), 'original-two\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('promoteStagedDirectory replaces destination contents only after staged tree exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-staged-dir-'));
  try {
    const stagedPath = path.join(root, 'stage', 'packages', 'cli', 'templates', 'repo');
    const destinationPath = path.join(root, 'repo', 'packages', 'cli', 'templates', 'repo');
    write(path.join(destinationPath, 'stale.txt'), 'stale\n');
    write(path.join(stagedPath, 'fresh.txt'), 'fresh\n');

    await promoteStagedDirectory({ stagedPath, destinationPath });

    assert.equal(fs.existsSync(path.join(destinationPath, 'stale.txt')), false);
    assert.equal(fs.readFileSync(path.join(destinationPath, 'fresh.txt'), 'utf8'), 'fresh\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('withTempDir cleans up staged workspaces after failure and reports the pipeline prefix', async () => {
  let leakedPath = null;
  await assert.rejects(
    () => withTempDir('playbook-cleanup-test-', async (tempDir) => {
      leakedPath = tempDir;
      write(path.join(tempDir, 'candidate.txt'), 'temp\n');
      throw new Error('boom');
    }),
    /playbook-cleanup-test- pipeline failed before promotion\. boom/
  );

  assert.ok(leakedPath);
  assert.equal(fs.existsSync(leakedPath), false);
});
