import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
import { runKnowledgeInspect } from './inspect.js';
import { runKnowledgeList } from './list.js';
import { runKnowledgeProvenance } from './provenance.js';
import { runKnowledgeQuery } from './query.js';
import { runKnowledgePortability } from './portability.js';
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

  if (subcommand === 'portability') {
    const portability = payload.portability as Array<Record<string, unknown>> | undefined;
    if (!portability || portability.length === 0) {
      return 'No portability records found.';
    }

    return portability
      .map(
        (entry) =>
          `Pattern: ${String(entry.pattern_id)}

Source Repo:
${String(entry.source_repo)}

Portability Score:
${String(entry.portability_score)}

Evidence Runs:
${String(entry.evidence_runs)}

Compatible Subsystems:
${((entry.compatible_subsystems as unknown[] | undefined) ?? []).map(String).join('\n')}

Risk Signals:
${((entry.risk_signals as unknown[] | undefined) ?? []).map(String).join('\n')}`
      )
      .join('\n\n---\n\n');
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
      if (subcommand === 'portability') {
        return runKnowledgePortability(cwd);
      }

      throw new Error('playbook knowledge: unsupported subcommand. Use list, query, inspect, timeline, provenance, stale, or portability.');
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
