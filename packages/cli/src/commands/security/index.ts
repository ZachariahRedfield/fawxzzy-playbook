import { ExitCode } from '../../lib/cliContract.js';
import { runSecurityBaseline } from './baseline.js';

type SecurityCommandOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

const printSecurityHelp = (): void => {
  console.log(`Usage: playbook security <subcommand>

Subcommands:
  baseline                    Show all baseline findings
  baseline show <package>     Show findings for a package
  baseline summary            Show categorized baseline summary`);
};

export const runSecurity = async (
  cwd: string,
  args: string[],
  options: SecurityCommandOptions
): Promise<number> => {
  const subcommand = args.find((arg) => !arg.startsWith('-'));

  if (!subcommand || args.includes('--help') || args.includes('-h')) {
    printSecurityHelp();
    return subcommand ? ExitCode.Success : ExitCode.Failure;
  }

  if (subcommand !== 'baseline') {
    const message = 'playbook security: unsupported subcommand. Use "playbook security baseline".';
    if (options.format === 'json') {
      console.log(JSON.stringify({ schemaVersion: '1.0', command: 'security', error: message }, null, 2));
    } else {
      console.error(message);
    }

    return ExitCode.Failure;
  }

  const baselineArgs = args.filter((arg, index) => !(index === 0 && arg === 'baseline'));
  return runSecurityBaseline(cwd, baselineArgs, options);
};
