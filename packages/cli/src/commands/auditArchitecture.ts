import { runArchitectureAudit } from '@zachariahredfield/playbook-core';
import { ExitCode } from '../lib/cliContract.js';

type AuditArchitectureOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

const printUsage = (): void => {
  console.log('Usage: playbook audit architecture [--json]');
};

const printSection = (
  sectionLabel: string,
  sectionAudits: Array<{
    id: string;
    title: string;
    status: 'pass' | 'warn' | 'fail';
    severity: 'low' | 'medium' | 'high';
    evidence: string[];
    recommendation: string;
  }>,
  withRecommendations: boolean
): void => {
  if (sectionAudits.length === 0) {
    return;
  }

  console.log('');
  console.log(sectionLabel);
  for (const audit of sectionAudits) {
    console.log(`- [${audit.status.toUpperCase()}] ${audit.id} (${audit.severity})`);
    console.log(`  ${audit.title}`);
    for (const evidenceLine of audit.evidence) {
      console.log(`  - evidence: ${evidenceLine}`);
    }
    if (withRecommendations) {
      console.log(`  - action: ${audit.recommendation}`);
    }
  }
};

const printHumanReport = (report: ReturnType<typeof runArchitectureAudit>): void => {
  console.log(`playbook audit architecture: ${report.summary.status.toUpperCase()}`);
  console.log(
    `Summary: checks=${report.summary.checks}, pass=${report.summary.pass}, warn=${report.summary.warn}, fail=${report.summary.fail}`
  );

  const failAndWarn = report.audits.filter(
    (audit: (typeof report.audits)[number]) => audit.status === 'fail' || audit.status === 'warn'
  );
  const pass = report.audits.filter((audit: (typeof report.audits)[number]) => audit.status === 'pass');

  printSection('Actionable findings', failAndWarn, true);
  printSection('Passing checks', pass, false);

  if (report.nextActions.length > 0) {
    console.log('');
    console.log('Next actions');
    for (const action of report.nextActions) {
      console.log(`- ${action}`);
    }
  }
};

export const runAuditArchitecture = async (cwd: string, commandArgs: string[], options: AuditArchitectureOptions): Promise<number> => {
  const subcommand = commandArgs.find((arg) => !arg.startsWith('-'));

  if (subcommand !== 'architecture') {
    if (!options.quiet) {
      printUsage();
    }
    return ExitCode.Failure;
  }

  const report = runArchitectureAudit(cwd);

  if (options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else if (!options.quiet) {
    printHumanReport(report);
  }

  return report.summary.fail > 0 ? ExitCode.Failure : ExitCode.Success;
};
