import {
  readSecurityBaselineArtifact,
  showSecurityBaselineForPackage,
  summarizeSecurityBaseline,
  type SecurityBaselineArtifact,
  type SecurityBaselineSummary
} from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../../lib/cliContract.js';

type BaselineCommandOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

const printHelp = (): void => {
  console.log(`Usage: playbook security baseline [show <package>|summary] [--json]

Inspect deterministic Grype security baseline findings captured in .playbook/security-baseline.json.`);
};

const printBaselineText = (artifact: SecurityBaselineArtifact): void => {
  console.log('Security baseline findings');
  console.log('──────────────────────────');
  console.log(`Generated at: ${artifact.generatedAt}`);
  console.log(`Findings: ${artifact.findings.length}`);

  if (artifact.findings.length === 0) {
    console.log('No findings captured.');
    return;
  }

  for (const finding of artifact.findings) {
    const dependencyPath = finding.dependency_path.length > 0 ? finding.dependency_path : '(none)';
    console.log(
      `- ${finding.package_name}@${finding.installed_version} ${finding.vulnerability_id} [${finding.severity}] ` +
        `(${finding.status}; ${finding.direct_or_transitive}; ${finding.ecosystem}; path: ${dependencyPath})`
    );
  }
};

const printSummaryText = (summary: SecurityBaselineSummary): void => {
  console.log('Security baseline summary');
  console.log('────────────────────────');
  console.log(`Generated at: ${summary.generatedAt}`);
  console.log(`Total findings: ${summary.totalFindings}`);

  console.log('By status:');
  for (const [status, count] of Object.entries(summary.byStatus)) {
    console.log(`- ${status}: ${count}`);
  }

  console.log('By severity:');
  for (const [severity, count] of Object.entries(summary.bySeverity)) {
    console.log(`- ${severity}: ${count}`);
  }
};

export const runSecurityBaseline = async (
  cwd: string,
  args: string[],
  options: BaselineCommandOptions
): Promise<number> => {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return ExitCode.Success;
  }

  const subcommand = args.find((arg) => !arg.startsWith('-'));

  try {
    if (!subcommand) {
      const payload = readSecurityBaselineArtifact(cwd);
      if (options.format === 'json') {
        console.log(JSON.stringify({ ...payload, command: 'security-baseline' }, null, 2));
      } else if (!options.quiet) {
        printBaselineText(payload);
      }

      return ExitCode.Success;
    }

    if (subcommand === 'summary') {
      const payload = summarizeSecurityBaseline(cwd);
      if (options.format === 'json') {
        console.log(JSON.stringify(payload, null, 2));
      } else if (!options.quiet) {
        printSummaryText(payload);
      }

      return ExitCode.Success;
    }

    if (subcommand === 'show') {
      const packageName = args.find((arg, index) => index > args.indexOf('show') && !arg.startsWith('-'));
      if (!packageName) {
        throw new Error('playbook security baseline show: missing <package> argument.');
      }

      const payload = showSecurityBaselineForPackage(cwd, packageName);
      if (options.format === 'json') {
        console.log(JSON.stringify({ ...payload, command: 'security-baseline-show', package: packageName }, null, 2));
      } else if (!options.quiet) {
        printBaselineText(payload);
      }

      return ExitCode.Success;
    }

    throw new Error('playbook security baseline: unsupported subcommand. Use "baseline", "baseline show <package>", or "baseline summary".');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (options.format === 'json') {
      console.log(JSON.stringify({ schemaVersion: '1.0', command: 'security-baseline', error: message }, null, 2));
    } else {
      console.error(message);
    }

    return ExitCode.Failure;
  }
};
