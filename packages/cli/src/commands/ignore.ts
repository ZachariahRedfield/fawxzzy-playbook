import {
  applySafePlaybookIgnoreRecommendations,
  suggestPlaybookIgnore,
  type PlaybookIgnoreApplyResult,
  type PlaybookIgnoreSuggestResult
} from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';

type IgnoreOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

const hasFlag = (args: string[], flag: string): boolean => args.includes(flag);

const printUsage = (): void => {
  console.log('Usage: playbook ignore <suggest|apply> [--json]');
  console.log('       playbook ignore apply --safe-defaults [--json]');
};

const printSuggestText = (result: PlaybookIgnoreSuggestResult): void => {
  console.log(`Playbook ignore suggestions (${result.summary.total_recommendations})`);
  console.log(`Source: ${result.recommendationSource}`);

  for (const entry of result.recommendations) {
    const coverage = entry.already_covered ? 'covered' : 'missing';
    const applyState = entry.eligible_for_safe_apply ? 'safe-default' : 'review';
    console.log(
      `- #${entry.rank} ${entry.path} [${entry.safety_level}] [${coverage}] [${applyState}] ${entry.expected_scan_impact.impact_level}`
    );
    console.log(`  rationale: ${entry.rationale}`);
  }
};

const printApplyText = (result: PlaybookIgnoreApplyResult): void => {
  console.log(`Playbook ignore apply: ${result.changed ? 'updated' : 'no change'}`);
  console.log(`Target: ${result.targetFile}`);
  console.log(`Applied: ${result.summary.applied_count}`);
  console.log(`Retained: ${result.summary.retained_count}`);
  console.log(`Already covered: ${result.summary.already_covered_count}`);
  console.log(`Deferred review: ${result.summary.deferred_count}`);

  if (result.applied_entries.length > 0) {
    console.log('Added entries:');
    for (const entry of result.applied_entries) {
      console.log(`- ${entry}`);
    }
  }
};

export const runIgnore = async (cwd: string, commandArgs: string[], options: IgnoreOptions): Promise<number> => {
  const subcommand = commandArgs.find((arg) => !arg.startsWith('-'));
  if (!subcommand || subcommand === 'help') {
    if (!options.quiet) {
      printUsage();
    }
    return subcommand ? ExitCode.Success : ExitCode.Failure;
  }

  if (subcommand === 'suggest') {
    const result = suggestPlaybookIgnore(cwd);
    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else if (!options.quiet) {
      printSuggestText(result);
    }
    return ExitCode.Success;
  }

  if (subcommand === 'apply') {
    if (!hasFlag(commandArgs, '--safe-defaults')) {
      console.error('playbook ignore apply requires --safe-defaults and only auto-applies safe-default recommendations.');
      return ExitCode.Failure;
    }

    const result = applySafePlaybookIgnoreRecommendations(cwd);
    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else if (!options.quiet) {
      printApplyText(result);
    }
    return ExitCode.Success;
  }

  console.error(`playbook ignore: unknown subcommand "${subcommand}"`);
  if (!options.quiet) {
    printUsage();
  }
  return ExitCode.Failure;
};
