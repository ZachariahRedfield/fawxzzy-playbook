import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
import { runKnowledgeInspect } from './inspect.js';
import { runKnowledgeList } from './list.js';
import { runKnowledgeProvenance } from './provenance.js';
import { runKnowledgeQuery } from './query.js';
import { printKnowledgeHelp, type KnowledgeCommandOptions } from './shared.js';
import { runKnowledgeStale } from './stale.js';
import { runKnowledgeTimeline } from './timeline.js';

const renderText = (subcommand: string, payload: Record<string, unknown>): string => {
  if (subcommand === 'inspect') {
    const knowledge = payload.knowledge as Record<string, unknown>;
    return `Knowledge ${String(payload.id)} (${String(knowledge.type ?? 'unknown')}).`;
  }

  if (subcommand === 'provenance') {
    const provenance = payload.provenance as { evidence?: unknown[]; relatedRecords?: unknown[] } | undefined;
    return `Resolved provenance for ${String(payload.id)} (${provenance?.evidence?.length ?? 0} evidence records, ${provenance?.relatedRecords?.length ?? 0} related records).`;
  }

  const knowledge = payload.knowledge as unknown[] | undefined;
  return `Found ${knowledge?.length ?? 0} knowledge records.`;
};

export const runKnowledge = async (cwd: string, args: string[], options: KnowledgeCommandOptions): Promise<number> => {
  const subcommand = args.find((arg) => !arg.startsWith('-'));

  if (!subcommand || args.includes('--help') || args.includes('-h')) {
    printKnowledgeHelp();
    return subcommand ? ExitCode.Success : ExitCode.Failure;
  }

  try {
    const payload = (() => {
      if (subcommand === 'list') {
        return runKnowledgeList(cwd, args);
      }
      if (subcommand === 'query') {
        return runKnowledgeQuery(cwd, args);
      }
      if (subcommand === 'inspect') {
        return runKnowledgeInspect(cwd, args);
      }
      if (subcommand === 'timeline') {
        return runKnowledgeTimeline(cwd, args);
      }
      if (subcommand === 'provenance') {
        return runKnowledgeProvenance(cwd, args);
      }
      if (subcommand === 'stale') {
        return runKnowledgeStale(cwd, args);
      }

      throw new Error('playbook knowledge: unsupported subcommand. Use list, query, inspect, timeline, provenance, or stale.');
    })();

    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: `knowledge ${subcommand}`, payload });
    } else if (!options.quiet) {
      console.log(renderText(subcommand, payload as Record<string, unknown>));
    }

    return ExitCode.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.format === 'json') {
      console.log(JSON.stringify({ schemaVersion: '1.0', command: `knowledge-${subcommand}`, error: message }, null, 2));
    } else {
      console.error(message);
    }

    return ExitCode.Failure;
  }
};
