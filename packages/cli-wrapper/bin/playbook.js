#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const binDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeEntry = path.resolve(binDir, '../runtime/main.js');

const result = spawnSync(process.execPath, [runtimeEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});

if (result.error) throw result.error;

process.exit(result.status ?? 1);
