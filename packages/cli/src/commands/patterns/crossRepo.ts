import fs from 'node:fs';
import path from 'node:path';
import {
  computeCrossRepoPatternLearning,
  readCrossRepoPatternsArtifact,
  writeCrossRepoPatternsArtifact,
  type CrossRepoInput,
  type CrossRepoPatternsArtifact
} from '@zachariahredfield/playbook-engine';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';

type PatternsOptions = { format: 'text' | 'json'; quiet: boolean; outFile?: string };

const readOptionValue = (args: string[], optionName: string): string | null => {
  const index = args.indexOf(optionName);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const readObserverRepos = (cwd: string): CrossRepoInput[] => {
  const registryPath = path.join(cwd, '.playbook', 'observer', 'repos.json');
  if (!fs.existsSync(registryPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as { repos?: Array<{ id?: string; root?: string }> };
    return (parsed.repos ?? []).map((repo) => ({ id: String(repo.id ?? ''), repoPath: String(repo.root ?? '') })).filter((repo) => repo.id && repo.repoPath);
  } catch {
    return [];
  }
};

const parseRepoArgs = (cwd: string, commandArgs: string[]): CrossRepoInput[] => {
  const repos: CrossRepoInput[] = [];
  for (let i = 0; i < commandArgs.length; i += 1) {
    if (commandArgs[i] === '--repo' && commandArgs[i + 1]) repos.push({ id: path.basename(commandArgs[i + 1]), repoPath: path.resolve(cwd, commandArgs[i + 1]) });
  }
  if (repos.length) return repos;
  const observerRepos = readObserverRepos(cwd);
  if (observerRepos.length) return observerRepos;
  return [{ id: path.basename(cwd), repoPath: cwd }];
};

const candidatePatternsFromArtifact = (artifact: any): any[] => {
  if (Array.isArray(artifact.candidate_patterns)) return artifact.candidate_patterns;
  if (Array.isArray(artifact.aggregates)) {
    return artifact.aggregates.map((entry: any) => ({
      id: entry.pattern_id,
      status: 'candidate_read_only',
      portability: { score: Number(entry.portability_score ?? 0), factors: [] },
      evidence: [],
      promotion: { mode: 'manual_only' }
    }));
  }
  return [];
};

const computeRepoDelta = (artifact: any, leftRepo: string, rightRepo: string): any[] => {
  if (Array.isArray(artifact.comparisons)) {
    const pair = artifact.comparisons.find((entry: any) =>
      (entry.left_repo_id === leftRepo && entry.right_repo_id === rightRepo) || (entry.left_repo_id === rightRepo && entry.right_repo_id === leftRepo)
    );
    if (pair) return pair.repo_deltas ?? [];
  }

  const left = artifact.repositories?.find((repo: any) => repo.id === leftRepo);
  const right = artifact.repositories?.find((repo: any) => repo.id === rightRepo);
  if (!left || !right) throw new Error(`playbook patterns repo-delta: repositories must exist in artifact (got: ${leftRepo}, ${rightRepo})`);
  const rightByPattern = new Map((right.patterns ?? []).map((entry: any) => [entry.pattern_id, entry]));
  return (left.patterns ?? [])
    .filter((entry: any) => rightByPattern.has(entry.pattern_id))
    .map((entry: any) => {
      const rhs: any = rightByPattern.get(entry.pattern_id)!;
      return {
        pattern_id: entry.pattern_id,
        left_repo: leftRepo,
        right_repo: rightRepo,
        strength_delta: Number(((entry.strength ?? 0) - (rhs.strength ?? 0)).toFixed(2)),
        attractor_delta: Number(((entry.attractor ?? 0) - (rhs.attractor ?? 0)).toFixed(2)),
        fitness_delta: Number(((entry.fitness ?? 0) - (rhs.fitness ?? 0)).toFixed(2))
      };
    });
};

export const runPatternsCrossRepo = (cwd: string, commandArgs: string[], options: PatternsOptions): number => {
  const repositories = parseRepoArgs(cwd, commandArgs.slice(1));
  const artifact = computeCrossRepoPatternLearning(repositories);
  writeCrossRepoPatternsArtifact(cwd, artifact);
  const payload = {
    schemaVersion: '1.0',
    command: 'patterns',
    action: 'cross-repo',
    mode: artifact.mode,
    source_repos: artifact.source_repos,
    comparisons: artifact.comparisons,
    candidate_patterns: artifact.candidate_patterns,
    aggregates: artifact.aggregates
  };
  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }
  if (!options.quiet) console.log(JSON.stringify(payload, null, 2));
  return ExitCode.Success;
};

export const runPatternsPortability = (cwd: string, commandArgs: string[], options: PatternsOptions): number => {
  const artifact = readCrossRepoPatternsArtifact(cwd) as any;
  const patternId = readOptionValue(commandArgs, '--pattern');
  const portability = candidatePatternsFromArtifact(artifact)
    .filter((entry: any) => !patternId || entry.id === patternId)
    .map((entry: any) => ({ pattern_id: entry.id ?? entry.pattern_id, portability_score: entry.portability?.score ?? entry.portability_score ?? 0, portability: entry.portability, evidence: entry.evidence, status: entry.status, promotion: entry.promotion }))
    .map((entry: any) => ({ pattern_id: entry.pattern_id, portability_score: entry.portability_score }));
  const payload = { schemaVersion: '1.0', command: 'patterns', action: 'portability', portability };
  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }
  if (!options.quiet) console.log(JSON.stringify(payload, null, 2));
  return ExitCode.Success;
};

export const runPatternsGeneralized = (cwd: string, options: PatternsOptions): number => {
  const artifact = readCrossRepoPatternsArtifact(cwd) as any;
  const generalized = candidatePatternsFromArtifact(artifact)
    .filter((entry: any) => Number(entry.portability?.score ?? entry.portability_score ?? 0) >= 0.85)
    .map((entry: any) => ({ ...entry, pattern_id: entry.id ?? entry.pattern_id }));
  const payload = { schemaVersion: '1.0', command: 'patterns', action: 'generalized', generalized };
  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }
  if (!options.quiet) console.log(JSON.stringify(payload, null, 2));
  return ExitCode.Success;
};

export const runPatternsRepoDelta = (cwd: string, commandArgs: string[], options: PatternsOptions): number => {
  const leftRepo = readOptionValue(commandArgs, '--left') ?? commandArgs[1];
  const rightRepo = readOptionValue(commandArgs, '--right') ?? commandArgs[2];
  if (!leftRepo || !rightRepo) throw new Error('playbook patterns repo-delta: requires --left <repoId> --right <repoId>.');
  const artifact = readCrossRepoPatternsArtifact(cwd) as any;
  const deltas = computeRepoDelta(artifact, leftRepo, rightRepo);
  const payload = { schemaVersion: '1.0', command: 'patterns', action: 'repo-delta', leftRepo, rightRepo, deltas };
  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }
  if (!options.quiet) console.log(JSON.stringify(payload, null, 2));
  return ExitCode.Success;
};
