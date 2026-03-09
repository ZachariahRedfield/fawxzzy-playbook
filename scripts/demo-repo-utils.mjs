#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const localCliEntrypoint = path.resolve(projectRoot, 'packages/cli/dist/main.js');

export const run = ({ cwd, command, args, allowFailure = false, env = process.env }) => {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (!allowFailure && result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const details = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(`Command failed (${command} ${args.join(' ')}):\n${details}`);
  }

  return result;
};

export const assertLocalCliBuild = () => {
  if (!fs.existsSync(localCliEntrypoint)) {
    throw new Error(
      `Local Playbook CLI build is missing at ${localCliEntrypoint}. Build the workspace first (pnpm -r build).`
    );
  }
};

export const installNodeDependencies = (repoDir) => {
  const hasPnpmLock = fs.existsSync(path.join(repoDir, 'pnpm-lock.yaml'));
  const hasPackageLock = fs.existsSync(path.join(repoDir, 'package-lock.json'));
  const hasYarnLock = fs.existsSync(path.join(repoDir, 'yarn.lock'));

  if (hasPnpmLock) {
    run({ cwd: repoDir, command: 'pnpm', args: ['install', '--frozen-lockfile'] });
    return;
  }

  if (hasPackageLock) {
    run({ cwd: repoDir, command: 'npm', args: ['ci'] });
    return;
  }

  if (hasYarnLock) {
    run({ cwd: repoDir, command: 'yarn', args: ['install', '--frozen-lockfile'] });
    return;
  }

  if (fs.existsSync(path.join(repoDir, 'package.json'))) {
    run({ cwd: repoDir, command: 'npm', args: ['install'] });
  }
};

export const cloneDemoRepository = ({ repoUrl, localPath, prefix }) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const demoDir = path.join(tempRoot, 'playbook-demo');

  if (localPath) {
    run({ cwd: tempRoot, command: 'cp', args: ['-R', localPath, demoDir] });
  } else {
    run({ cwd: tempRoot, command: 'git', args: ['clone', '--depth', '1', repoUrl, demoDir] });
  }

  return { tempRoot, demoDir };
};

export const runPlaybookCli = ({ cwd, commandArgs, expectSuccess = true }) =>
  run({
    cwd,
    command: 'node',
    args: [localCliEntrypoint, ...commandArgs],
    allowFailure: !expectSuccess
  });
