#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  countChangedManagedDocsArtifacts,
  generateManagedDocsArtifacts,
  repoRoot,
  writeManagedDocsArtifacts
} from './managed-docs-lib.mjs';

const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');

const runCommand = (cwd, command, commandArgs) => {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed with exit code ${result.status ?? 1}.`);
  }
};

const createOverlayWorkspace = async (outputs) => {
  const overlayRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-managed-docs-'));
  const overridden = new Set(outputs.map((output) => output.relativePath));

  const materializeTree = async (relativePath = '') => {
    const sourceDir = path.join(repoRoot, relativePath);
    const destinationDir = path.join(overlayRoot, relativePath);
    await fs.mkdir(destinationDir, { recursive: true });
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const childRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      const sourcePath = path.join(repoRoot, childRelativePath);
      const destinationPath = path.join(overlayRoot, childRelativePath);
      const isExactOverride = overridden.has(childRelativePath);
      const containsOverride = [...overridden].some((target) => target.startsWith(`${childRelativePath}${path.sep}`));

      if (isExactOverride) {
        continue;
      }

      if (entry.isDirectory() && containsOverride) {
        await materializeTree(childRelativePath);
        continue;
      }

      await fs.symlink(sourcePath, destinationPath, entry.isDirectory() ? 'dir' : 'file');
    }
  };

  await materializeTree();

  for (const output of outputs) {
    const destination = path.join(overlayRoot, output.relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, output.next);
  }

  return overlayRoot;
};

const main = async () => {
  const outputs = await generateManagedDocsArtifacts();
  const changedFiles = countChangedManagedDocsArtifacts(outputs);
  const overlayRoot = await createOverlayWorkspace(outputs);

  try {
    runCommand(overlayRoot, 'node', ['scripts/validate-roadmap-contract.mjs', '--ci']);
    runCommand(overlayRoot, 'node', ['scripts/run-playbook.mjs', 'docs', 'audit', '--ci', '--json']);
  } finally {
    await fs.rm(overlayRoot, { recursive: true, force: true });
  }

  if (checkMode) {
    if (changedFiles > 0) {
      console.error(`Managed docs are stale in ${changedFiles} file(s). Run "pnpm docs:update".`);
      process.exitCode = 1;
      return;
    }
    console.log('Managed docs are up to date.');
    return;
  }

  if (changedFiles === 0) {
    console.log('Managed docs already up to date.');
    return;
  }

  await writeManagedDocsArtifacts(outputs);
  console.log(`Updated managed docs in ${changedFiles} file(s) after generate → validate → promote.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
