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

export const runPatternsDoctrineCandidates = (cwd: string, options: PatternsOptions): number => {
  const graph = readContractPatternGraph(cwd);

  const candidates = graph.patterns
    .map((pattern: PatternGraphArtifact['patterns'][number]) => {
      const summary = summarizePatternOutcomeSignals(pattern);
      return {
        patternId: summary.patternId,
        status: pattern.status,
        attractor: summary.signals.attractor,
        fitness: summary.signals.fitness,
        strength: summary.signals.strength,
        outcomes: summary.outcomes
      };
    })
    .filter((pattern: { status: string; strength: number }) => pattern.status === 'promoted' || pattern.status === 'canonical' || pattern.strength >= 0.75)
    .sort((left: { strength: number; patternId: string }, right: { strength: number; patternId: string }) => right.strength - left.strength || left.patternId.localeCompare(right.patternId));

  const payload = {
    schemaVersion: '1.0',
    command: 'patterns',
    action: 'doctrine-candidates',
    candidates
  };

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    console.log('Doctrine candidate patterns');
    console.log('──────────────────────────');
    for (const candidate of candidates) {
      console.log(`${candidate.patternId} (${candidate.status}) strength=${candidate.strength.toFixed(2)}`);
    }
  }

  return ExitCode.Success;
};
