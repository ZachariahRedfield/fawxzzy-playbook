import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
import { readContractPatternGraph } from './graph.js';

type PatternGraphPattern = ReturnType<typeof readContractPatternGraph>['patterns'][number];

type PatternsOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  outFile?: string;
};

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const clamp = (value: number): number => Math.max(0, Math.min(1, round2(value)));

const computeAttractor = (pattern: PatternGraphPattern): number =>
  round2(pattern.scores[pattern.scores.length - 1]?.value ?? 0);

const computeFitness = (attractor: number): number => clamp(attractor * 0.9);

const computeStrength = (attractor: number, fitness: number): number => clamp((attractor + fitness) / 2);

const inferOutcomes = (pattern: PatternGraphPattern): string[] => {
  const descriptor = `${pattern.id} ${pattern.title} ${pattern.description}`.toLowerCase();

  if (descriptor.includes('modular')) {
    return ['low blast radius', 'stable contracts', 'reduced dependency churn'];
  }

  if (pattern.layer.toLowerCase().includes('architecture')) {
    return ['clear module boundaries', 'predictable integration points', 'safer incremental delivery'];
  }

  if (pattern.layer.toLowerCase().includes('execution')) {
    return ['repeatable workflows', 'bounded failure recovery', 'lower operational variance'];
  }

  return ['higher decision clarity', 'improved maintainability', 'more reusable implementation patterns'];
};

const findPattern = (cwd: string, patternId: string): PatternGraphPattern => {
  const graph = readContractPatternGraph(cwd);
  const pattern = graph.patterns.find((entry: PatternGraphPattern) => entry.id === patternId);
  if (!pattern) {
    throw new Error(`playbook patterns outcomes: pattern not found: ${patternId}`);
  }
  return pattern;
};

export type PatternOutcomeSignals = {
  attractor: number;
  fitness: number;
  strength: number;
};

export const summarizePatternOutcomeSignals = (
  pattern: PatternGraphPattern
): { patternId: string; signals: PatternOutcomeSignals; outcomes: string[] } => {
  const attractor = computeAttractor(pattern);
  const fitness = computeFitness(attractor);
  const strength = computeStrength(attractor, fitness);
  return {
    patternId: pattern.id,
    signals: { attractor, fitness, strength },
    outcomes: inferOutcomes(pattern)
  };
};

export const runPatternsOutcomes = (cwd: string, commandArgs: string[], options: PatternsOptions): number => {
  const patternId = commandArgs[1];
  if (!patternId) {
    throw new Error('playbook patterns outcomes: requires <patternId>.');
  }

  const pattern = findPattern(cwd, patternId);
  const summary = summarizePatternOutcomeSignals(pattern);

  const payload = {
    schemaVersion: '1.0',
    command: 'patterns',
    action: 'outcomes',
    patternId: summary.patternId,
    signals: summary.signals,
    outcomes: summary.outcomes
  };

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    console.log(summary.patternId);
    console.log(`attractor: ${summary.signals.attractor.toFixed(2)}`);
    console.log(`fitness: ${summary.signals.fitness.toFixed(2)}`);
    console.log(`strength: ${summary.signals.strength.toFixed(2)}`);
    console.log('');
    console.log('outcomes:');
    for (const outcome of summary.outcomes) {
      console.log(`- ${outcome}`);
    }
  }

  return ExitCode.Success;
};
