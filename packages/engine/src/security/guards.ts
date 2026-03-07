import fs from 'node:fs';
import path from 'node:path';
import type { PlanTask } from '../execution/types.js';

const DISALLOWED_PREFIXES = ['/etc', '/proc', '/sys', '/dev', '/var/run'];
const ALLOWED_FILE_EXTENSIONS = new Set(['.md', '.json', '.yml', '.yaml', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const MAX_PLAN_TASKS = 200;
const MAX_ACTION_LENGTH = 400;

const toAbsolute = (repoRoot: string, candidatePath: string): string =>
  path.isAbsolute(candidatePath) ? path.normalize(candidatePath) : path.resolve(repoRoot, candidatePath);

const assertNoSymlinkSegments = (repoRootReal: string, absoluteTarget: string): void => {
  const relative = path.relative(repoRootReal, absoluteTarget);
  const segments = relative.split(path.sep).filter(Boolean);
  let cursor = repoRootReal;

  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) {
      continue;
    }

    const stats = fs.lstatSync(cursor);
    if (stats.isSymbolicLink()) {
      throw new Error(`Security boundary violation: symlink traversal is not allowed (${cursor}).`);
    }
  }
};

export const validateRepoBoundary = (repoRoot: string, candidatePath: string): string => {
  const repoRootReal = fs.realpathSync(repoRoot);
  const absoluteTarget = toAbsolute(repoRootReal, candidatePath);

  const relativeToRoot = path.relative(repoRootReal, absoluteTarget);
  const escapesRoot = relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot);
  if (escapesRoot) {
    throw new Error(`Security boundary violation: path escapes repository root (${candidatePath}).`);
  }

  const posixTarget = absoluteTarget.split(path.sep).join('/');
  if (DISALLOWED_PREFIXES.some((prefix) => posixTarget.startsWith(prefix))) {
    throw new Error(`Security boundary violation: disallowed target path (${candidatePath}).`);
  }

  assertNoSymlinkSegments(repoRootReal, absoluteTarget);

  return relativeToRoot.split(path.sep).join('/');
};

const validateTaskShape = (task: PlanTask, repoRoot: string): void => {
  if (task.action.trim().length === 0 || task.action.length > MAX_ACTION_LENGTH) {
    throw new Error(`Invalid remediation task ${task.id}: action must be between 1 and ${MAX_ACTION_LENGTH} characters.`);
  }

  if (task.file === null) {
    return;
  }

  const normalized = validateRepoBoundary(repoRoot, task.file);
  const extension = path.extname(normalized).toLowerCase();
  if (extension && !ALLOWED_FILE_EXTENSIONS.has(extension)) {
    throw new Error(`Invalid remediation task ${task.id}: file extension ${extension} is not allowed by policy.`);
  }
};

export const validateRemediationPlan = (repoRoot: string, tasks: PlanTask[]): void => {
  if (tasks.length > MAX_PLAN_TASKS) {
    throw new Error(`Invalid remediation plan: task count ${tasks.length} exceeds policy limit ${MAX_PLAN_TASKS}.`);
  }

  const seenTaskIds = new Set<string>();
  for (const task of tasks) {
    if (seenTaskIds.has(task.id)) {
      throw new Error(`Invalid remediation plan: duplicate task id ${task.id}.`);
    }
    seenTaskIds.add(task.id);
    validateTaskShape(task, repoRoot);
  }
};

export const redactSecretsForLogs = (message: string): string => {
  return message
    .replace(/ghp_[A-Za-z0-9]{20,}/g, '[REDACTED]')
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]')
    .replace(/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g, '[REDACTED]')
    .replace(/((?:token|secret|password)\s*[=:]\s*)([^\s"']+)/gi, '$1[REDACTED]');
};
