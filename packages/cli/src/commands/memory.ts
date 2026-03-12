import { promoteKnowledgeCandidate, pruneMemory } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { emitJsonOutput } from '../lib/jsonArtifact.js';

type MemoryOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

const parseOption = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : undefined;
};

const printHelp = (): void => {
  console.log(`Usage: playbook memory <promote|prune> [options]

Promotion and pruning workflows for semantic memory artifacts.

Subcommands:
  promote --from-candidate <id>   Promote a reviewed candidate into semantic memory
  prune                           Prune stale/superseded/duplicate memory artifacts

Options:
  --stale-days <days>             For prune: candidate staleness threshold (default 30)
  --json                          Print machine-readable JSON output
  --help                          Show help`);
};

export const runMemory = async (cwd: string, commandArgs: string[], options: MemoryOptions): Promise<number> => {
  const subcommand = commandArgs.find((arg) => !arg.startsWith('-'));

  if (!subcommand || subcommand === 'help' || commandArgs.includes('--help') || commandArgs.includes('-h')) {
    printHelp();
    return ExitCode.Success;
  }

  try {
    if (subcommand === 'promote') {
      const fromCandidate = parseOption(commandArgs, '--from-candidate');
      if (!fromCandidate) {
        throw new Error('playbook memory promote requires --from-candidate <id>.');
      }

      const payload = promoteKnowledgeCandidate(cwd, fromCandidate);

      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'memory promote', payload });
      } else if (!options.quiet) {
        console.log(`Promoted candidate ${payload.promoted.provenance.promotedFromCandidateId} -> ${payload.knowledgeKind}`);
        console.log(`Artifact item id: ${payload.promoted.id}`);
      }

      return ExitCode.Success;
    }

    if (subcommand === 'prune') {
      const staleDaysRaw = parseOption(commandArgs, '--stale-days');
      const staleDays = staleDaysRaw ? Number(staleDaysRaw) : 30;
      const payload = pruneMemory(cwd, { staleDays: Number.isFinite(staleDays) ? staleDays : 30 });

      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'memory prune', payload });
      } else if (!options.quiet) {
        console.log(`Pruned stale candidates: ${payload.staleCandidatesPruned}`);
        console.log(`Pruned superseded items: ${payload.supersededPruned}`);
        console.log(`Collapsed duplicates: ${payload.duplicatesCollapsed}`);
      }

      return ExitCode.Success;
    }

    throw new Error('playbook memory: unsupported subcommand. Use promote or prune.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.format === 'json') {
      console.log(
        JSON.stringify(
          {
            schemaVersion: '1.0',
            command: 'memory',
            error: message
          },
          null,
          2
        )
      );
    } else {
      console.error(message);
    }

    return ExitCode.Failure;
  }
};
