import { createHash } from 'node:crypto';
import type { RuleFailure } from './types.js';

export const PLAN_TASK_ID_SCHEMA_VERSION = '1.0' as const;

const normalizeText = (value: string): string => value.trim().replace(/\s+/gu, ' ');

export const buildStableTaskSemanticKey = (finding: RuleFailure): string => {
  const action = finding.fix ?? finding.message;
  const canonical = {
    ruleId: normalizeText(finding.id),
    evidence: normalizeText(finding.evidence ?? ''),
    action: normalizeText(action),
    autoFix: Boolean(finding.fix)
  };

  return JSON.stringify(canonical);
};

export const buildStableTaskId = (semanticKey: string, occurrence: number): string => {
  const digest = createHash('sha256').update(semanticKey).digest('hex').slice(0, 10);
  return `task-${digest}-${occurrence}`;
};

const SUPPORTED_SPECIAL_PREFIXES = ['task-artifact-', 'maintenance:', 'release-'] as const;
const STABLE_TASK_ID_PATTERN = /^task-[a-f0-9]{10}-[1-9][0-9]*$/;

export const isSupportedTaskId = (value: string): boolean =>
  STABLE_TASK_ID_PATTERN.test(value) || SUPPORTED_SPECIAL_PREFIXES.some((prefix) => value.startsWith(prefix));
