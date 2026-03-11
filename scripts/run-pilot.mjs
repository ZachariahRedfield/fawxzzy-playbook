#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const targetRepo = args[0];
const passthroughArgs = args.slice(1);

if (!targetRepo) {
  console.error('Usage: pnpm pilot "<target-repo-path>" [--json]');
  process.exit(1);
}

const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpmBin, ['playbook', 'pilot', '--repo', targetRepo, ...passthroughArgs], {
  stdio: 'inherit'
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
