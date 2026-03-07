import { architectureAuditChecks } from './checks/architectureChecks.js';
import type { ArchitectureAuditReport, ArchitectureAuditResult, ArchitectureAuditSummaryStatus } from './types.js';

const compareText = (left: string, right: string): number => left.localeCompare(right);

const compareResult = (left: ArchitectureAuditResult, right: ArchitectureAuditResult): number => {
  const idDiff = left.id.localeCompare(right.id);
  if (idDiff !== 0) {
    return idDiff;
  }
  return left.title.localeCompare(right.title);
};

const summarizeStatus = (warnCount: number, failCount: number): ArchitectureAuditSummaryStatus => {
  if (failCount > 0) {
    return 'fail';
  }
  return warnCount > 0 ? 'warn' : 'pass';
};

const buildNextActions = (results: ArchitectureAuditResult[]): string[] => {
  const actions = results
    .filter((result) => result.status !== 'pass')
    .map((result) => `${result.id}: ${result.recommendation}`)
    .sort(compareText);

  return actions.length > 0 ? actions : ['No action required. Architecture guardrails satisfy deterministic checks.'];
};

export const runArchitectureAudit = (repoRoot: string): ArchitectureAuditReport => {
  const checks = [...architectureAuditChecks].sort((left, right) => left.id.localeCompare(right.id));
  const audits = checks.map((check) => check.run({ repoRoot })).sort(compareResult);
  const pass = audits.filter((result) => result.status === 'pass').length;
  const warn = audits.filter((result) => result.status === 'warn').length;
  const fail = audits.filter((result) => result.status === 'fail').length;

  return {
    schemaVersion: '1.0',
    command: 'audit-architecture',
    ok: fail === 0,
    summary: {
      status: summarizeStatus(warn, fail),
      checks: audits.length,
      pass,
      warn,
      fail
    },
    audits,
    // Severity semantics are standardized across checks:
    // pass = minimum contract satisfied, warn = missing/incomplete but non-blocking,
    // fail = contract-breaking unsafe gap (reserved for strict checks as they are introduced).
    nextActions: buildNextActions(audits)
  };
};
