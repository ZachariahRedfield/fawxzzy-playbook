import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeOutcomeTelemetryArtifact,
  normalizeProcessTelemetryArtifact,
  summarizeStructuralTelemetry,
  type OutcomeTelemetryArtifact,
  type ProcessTelemetryArtifact
} from '@zachariahredfield/playbook-engine';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';

type TelemetryCommandOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

const OUTCOME_TELEMETRY_PATH = ['.playbook', 'outcome-telemetry.json'] as const;
const PROCESS_TELEMETRY_PATH = ['.playbook', 'process-telemetry.json'] as const;

const readJsonArtifact = <T>(cwd: string, segments: readonly string[], artifactLabel: string): T => {
  const artifactPath = path.join(cwd, ...segments);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`playbook telemetry: missing ${artifactLabel} artifact at ${segments.join('/')}.`);
  }

  return JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as T;
};

const printTelemetryHelp = (): void => {
  console.log(`Usage: playbook telemetry <subcommand> [--json]\n\nSubcommands:\n  outcomes                     Inspect .playbook/outcome-telemetry.json\n  process                      Inspect .playbook/process-telemetry.json\n  summary                      Show combined deterministic telemetry summary`);
};

const renderTextOutcome = (artifact: OutcomeTelemetryArtifact): void => {
  console.log('Outcome telemetry');
  console.log('─────────────────');
  console.log(`Generated at: ${artifact.generatedAt}`);
  console.log(`Records: ${artifact.summary.total_records}`);
  console.log(`Plan churn (sum): ${artifact.summary.sum_plan_churn}`);
  console.log(`Apply retries (sum): ${artifact.summary.sum_apply_retries}`);
  console.log(`Dependency drift (sum): ${artifact.summary.sum_dependency_drift}`);
  console.log(`Contract breakage (sum): ${artifact.summary.sum_contract_breakage}`);
  console.log(`Docs mismatch (count): ${artifact.summary.docs_mismatch_count}`);
};

const renderTextProcess = (artifact: ProcessTelemetryArtifact): void => {
  console.log('Process telemetry');
  console.log('─────────────────');
  console.log(`Generated at: ${artifact.generatedAt}`);
  console.log(`Records: ${artifact.summary.total_records}`);
  console.log(`Total task duration (ms): ${artifact.summary.total_task_duration_ms}`);
  console.log(`Average task duration (ms): ${artifact.summary.average_task_duration_ms}`);
  console.log(`Total retry count: ${artifact.summary.total_retry_count}`);
  console.log(`First-pass success count: ${artifact.summary.first_pass_success_count}`);
  console.log(`Average merge conflict risk: ${artifact.summary.average_merge_conflict_risk}`);
};

export const runTelemetry = async (
  cwd: string,
  args: string[],
  options: TelemetryCommandOptions
): Promise<number> => {
  const subcommand = args.find((arg) => !arg.startsWith('-'));

  if (!subcommand || args.includes('--help') || args.includes('-h')) {
    printTelemetryHelp();
    return subcommand ? ExitCode.Success : ExitCode.Failure;
  }

  if (subcommand === 'outcomes') {
    const outcomeArtifact = normalizeOutcomeTelemetryArtifact(
      readJsonArtifact<OutcomeTelemetryArtifact>(cwd, OUTCOME_TELEMETRY_PATH, 'outcome telemetry')
    );

    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'telemetry', payload: outcomeArtifact });
      return ExitCode.Success;
    }

    if (!options.quiet) {
      renderTextOutcome(outcomeArtifact);
    }

    return ExitCode.Success;
  }

  if (subcommand === 'process') {
    const processArtifact = normalizeProcessTelemetryArtifact(
      readJsonArtifact<ProcessTelemetryArtifact>(cwd, PROCESS_TELEMETRY_PATH, 'process telemetry')
    );

    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'telemetry', payload: processArtifact });
      return ExitCode.Success;
    }

    if (!options.quiet) {
      renderTextProcess(processArtifact);
    }

    return ExitCode.Success;
  }

  if (subcommand === 'summary') {
    const outcomeArtifact = readJsonArtifact<OutcomeTelemetryArtifact>(cwd, OUTCOME_TELEMETRY_PATH, 'outcome telemetry');
    const processArtifact = readJsonArtifact<ProcessTelemetryArtifact>(cwd, PROCESS_TELEMETRY_PATH, 'process telemetry');
    const summary = summarizeStructuralTelemetry(outcomeArtifact, processArtifact);

    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'telemetry', payload: summary });
      return ExitCode.Success;
    }

    if (!options.quiet) {
      console.log('Telemetry summary');
      console.log('─────────────────');
      console.log(`Generated at: ${summary.generatedAt}`);
      console.log(`Outcome records: ${summary.outcomes.total_records}`);
      console.log(`Process records: ${summary.process.total_records}`);
    }

    return ExitCode.Success;
  }

  const message = 'playbook telemetry: unsupported subcommand. Use "playbook telemetry outcomes|process|summary".';
  if (options.format === 'json') {
    console.log(JSON.stringify({ schemaVersion: '1.0', command: 'telemetry', error: message }, null, 2));
  } else {
    console.error(message);
  }
  return ExitCode.Failure;
};
