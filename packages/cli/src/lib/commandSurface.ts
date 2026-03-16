import { emitResult, ExitCode, type CliOutputFormat } from './cliContract.js';

export type SurfaceRuntimeOptions = {
  format: CliOutputFormat;
  quiet: boolean;
};

export const hasHelpFlag = (args: string[]): boolean => args.includes('--help') || args.includes('-h');

export const printCommandHelp = (config: {
  usage: string;
  description: string;
  options: string[];
  artifacts?: string[];
}): void => {
  console.log(`Usage: ${config.usage}`);
  console.log('');
  console.log(config.description);
  console.log('');
  console.log('Options:');
  for (const option of config.options) {
    console.log(`  ${option}`);
  }

  if (config.artifacts && config.artifacts.length > 0) {
    console.log('');
    console.log('Owned artifacts:');
    for (const artifact of config.artifacts) {
      console.log(`  - ${artifact}`);
    }
  }
};

export const emitCommandFailure = (
  command: string,
  runtime: SurfaceRuntimeOptions,
  failure: {
    summary: string;
    findingId: string;
    message: string;
    nextActions?: string[];
  }
): number => {
  emitResult({
    format: runtime.format,
    quiet: runtime.quiet,
    command,
    ok: false,
    exitCode: ExitCode.Failure,
    summary: failure.summary,
    findings: [{ id: failure.findingId, level: 'error', message: failure.message }],
    nextActions: failure.nextActions ?? []
  });

  return ExitCode.Failure;
};
