import type { VerifyReport } from './types.js';

export const formatJson = (report: VerifyReport): string => JSON.stringify(report, null, 2);

export const formatHuman = (report: VerifyReport): string => {
  const lines: string[] = [];
  lines.push(report.ok ? '✔ Verification passed' : '✖ Verification failed');
  if (report.summary.baseRef || report.summary.baseSha) {
    lines.push(`Base: ${report.summary.baseRef ?? 'unknown'} (${report.summary.baseSha ?? 'unknown'})`);
  }

  if (report.failures.length) {
    lines.push('');
    for (const failure of report.failures) {
      lines.push(`[${failure.id}] ${failure.message}`);
      if (failure.path) lines.push(`Path: ${failure.path}`);
      if (failure.hint) lines.push(`Hint: ${failure.hint}`);
      if (failure.evidence) lines.push(`Evidence: ${failure.evidence}`);
      if (failure.fix) lines.push(`Fix: ${failure.fix}`);
      lines.push('');
    }
  }

  if (report.warnings.length) {
    lines.push('Warnings:');
    for (const warning of report.warnings) {
      lines.push(`- [${warning.id}] ${warning.message}`);
    }
  }

  return lines.join('\n').trimEnd();
};
