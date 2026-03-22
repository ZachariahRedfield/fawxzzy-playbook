import fs from 'node:fs';
import path from 'node:path';
import { ExitCode } from '../../lib/cliContract.js';

type ReleaseCommandOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

type ReleasePlanPayload = {
  summary: {
    recommendedBump: string;
    reasons: string[];
  };
};

const DEFAULT_OUT = '.playbook/release-plan.json';

const printReleaseHelp = (): void => {
  console.log(`Usage: playbook release <subcommand> [options]

Subcommands:
  plan                       Build a deterministic release/version plan

Options for \`release plan\`:
  --base <ref>               Optional git base ref used for diff resolution
  --out <path>               Write the plan artifact (default: ${DEFAULT_OUT})
  --json                     Print machine-readable JSON output
  --help                     Show help`);
};

export const runRelease = async (
  cwd: string,
  args: string[],
  options: ReleaseCommandOptions
): Promise<number> => {
  const subcommand = args.find((arg) => !arg.startsWith('-'));
  if (!subcommand || args.includes('--help') || args.includes('-h')) {
    printReleaseHelp();
    return subcommand ? ExitCode.Success : ExitCode.Failure;
  }

  if (subcommand !== 'plan') {
    const message = 'playbook release: unsupported subcommand. Use "playbook release plan".';
    if (options.format === 'json') {
      console.log(JSON.stringify({ schemaVersion: '1.0', command: 'release', error: message }, null, 2));
    } else {
      console.error(message);
    }
    return ExitCode.Failure;
  }

  const baseIndex = args.indexOf('--base');
  const outIndex = args.indexOf('--out');
  const baseRef = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
  const outFile = outIndex >= 0 ? args[outIndex + 1] : DEFAULT_OUT;

  try {
    const engine = await import('@zachariahredfield/playbook-engine');
    const buildReleasePlan = (engine as unknown as { buildReleasePlan: (repoRoot: string, options?: { baseRef?: string }) => ReleasePlanPayload }).buildReleasePlan;
    const payload = buildReleasePlan(cwd, { baseRef });
    const absoluteOutputPath = path.resolve(cwd, outFile);
    fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
    fs.writeFileSync(absoluteOutputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    if (options.format === 'json') {
      console.log(JSON.stringify(payload, null, 2));
      return ExitCode.Success;
    }

    if (!options.quiet) {
      console.log(`playbook release plan: ${payload.summary.recommendedBump}`);
      console.log(`artifact: ${outFile}`);
      for (const reason of payload.summary.reasons) {
        console.log(`- ${reason}`);
      }
    }

    return ExitCode.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.format === 'json') {
      console.log(JSON.stringify({ schemaVersion: '1.0', command: 'release', error: message }, null, 2));
    } else {
      console.error(message);
    }
    return ExitCode.Failure;
  }
};
