import fs from 'node:fs';
import path from 'node:path';
import type { ExecutionRun } from '@zachariahredfield/playbook-core';

const RUNS_DIR = path.join('.playbook', 'runs');

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
      const entry = canonicalize(record[key]);
      if (entry !== undefined) {
        normalized[key] = entry;
      }
    }
    return normalized;
  }

  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  return value;
};

const deterministicStringify = (value: unknown): string => `${JSON.stringify(canonicalize(value), null, 2)}\n`;

export const executionRunArtifactPath = (repoRoot: string, runId: string): string => path.join(repoRoot, RUNS_DIR, `${runId}.json`);

export const writeExecutionRun = (repoRoot: string, run: ExecutionRun): string => {
  const targetPath = executionRunArtifactPath(repoRoot, run.id);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, deterministicStringify(run), 'utf8');
  fs.renameSync(tempPath, targetPath);
  return targetPath;
};

export const readExecutionRun = (repoRoot: string, runId: string): ExecutionRun => {
  const payload = JSON.parse(fs.readFileSync(executionRunArtifactPath(repoRoot, runId), 'utf8')) as ExecutionRun;
  if (!payload || typeof payload !== 'object' || payload.version !== 1 || typeof payload.id !== 'string') {
    throw new Error(`Invalid execution run artifact for id: ${runId}`);
  }
  return payload;
};

export const listExecutionRuns = (repoRoot: string): ExecutionRun[] => {
  const runsPath = path.join(repoRoot, RUNS_DIR);
  if (!fs.existsSync(runsPath)) {
    return [];
  }

  return fs
    .readdirSync(runsPath)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(runsPath, name), 'utf8')) as ExecutionRun)
    .filter((run) => run && typeof run.id === 'string' && run.version === 1)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
};

