#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const targetRepo = process.argv[2];
if (!targetRepo) {
  console.error('Usage: pnpm pilot "<target-repo-path>"');
  process.exit(1);
}

const result = spawnSync('pnpm', ['playbook', 'pilot', '--repo', targetRepo, ...process.argv.slice(3)], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
