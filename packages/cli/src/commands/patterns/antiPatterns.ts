import type { PatternGraphArtifact } from '@zachariahredfield/playbook-engine';
import { readContractPatternGraph } from './graph.js';
import { summarizePatternOutcomeSignals } from './outcomes.js';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';

type PatternsOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  outFile?: string;
};

const inferRisks = (patternId: string): string[] => {
  const id = patternId.toLowerCase();
  if (id.includes('modular')) {
    return ['tight coupling', 'cross-module regressions', 'contract breakage'];
  }
  if (id.includes('layer')) {
    return ['layer leakage', 'unclear responsibility boundaries', 'dependency inversion drift'];
  }
  return ['unclear ownership boundaries', 'repeated remediation churn', 'fragile operational behavior'];
};

export const runPatternsAntiPatterns = (cwd: string, options: PatternsOptions): number => {
  const graph = readContractPatternGraph(cwd);

  const antiPatterns = graph.patterns
    .map((pattern: PatternGraphArtifact['patterns'][number]) => {
      const summary = summarizePatternOutcomeSignals(pattern);
      return {
        patternId: summary.patternId,
        attractor: summary.signals.attractor,
        fitness: summary.signals.fitness,
        strength: summary.signals.strength,
        antiPatterns: inferRisks(summary.patternId)
      };
    })
    .sort((left: { strength: number; patternId: string }, right: { strength: number; patternId: string }) => left.strength - right.strength || left.patternId.localeCompare(right.patternId));

  const payload = {
    schemaVersion: '1.0',
    command: 'patterns',
    action: 'anti-patterns',
    antiPatterns
  };

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    console.log('Pattern anti-pattern risks');
    console.log('──────────────────────────');
    for (const candidate of antiPatterns) {
      console.log(`${candidate.patternId}: ${candidate.antiPatterns.join(', ')}`);
    }
  }

  return ExitCode.Success;
};
