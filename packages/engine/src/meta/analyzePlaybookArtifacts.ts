import fs from 'node:fs';
import path from 'node:path';

import type { ContractProposal } from '../schema/contractProposal.js';
import type { CandidatePatternPreviewArtifact, GraphGroupArtifact, GraphSnapshot } from '../schema/graphMemory.js';
import type { MetaFindingsArtifact, MetaImprovementProposal } from '../schema/metaFinding.js';
import type { MetaPatternsArtifact, MetaTelemetryArtifact } from '../schema/metaPattern.js';
import type { PatternCardCollectionArtifact } from '../schema/patternCard.js';
import type { PromotionDecisionArtifact } from '../schema/promotionDecision.js';
import type { RunCycle } from '../schema/runCycle.js';
import { buildMetaFindings, buildMetaPatterns } from './buildMetaFindings.js';
import { buildMetaTelemetry } from './buildMetaTelemetry.js';

const sortAsc = (values: string[]): string[] => [...values].sort((a, b) => a.localeCompare(b));

const readJson = <T>(filePath: string): T | undefined => {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

const collectJsonFiles = (directory: string): string[] => {
  if (!fs.existsSync(directory)) return [];
  return sortAsc(
    fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(directory, entry.name))
  );
};

const readMany = <T>(paths: string[]): T[] =>
  paths
    .map((filePath) => readJson<T>(filePath))
    .filter((artifact): artifact is T => artifact !== undefined);

const ensureDir = (directory: string): void => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

const writeArtifact = (filePath: string, payload: unknown): void => {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const writeProposals = (directory: string, proposals: MetaImprovementProposal[]): string[] => {
  ensureDir(directory);

  const proposalPaths = proposals
    .sort((a, b) => a.proposalId.localeCompare(b.proposalId))
    .map((proposal) => {
      const proposalPath = path.join(directory, `${proposal.proposalId.replaceAll(':', '__')}.json`);
      writeArtifact(proposalPath, proposal);
      return proposalPath;
    });

  return proposalPaths;
};

export type AnalyzePlaybookArtifactsInput = {
  repoRoot: string;
  createdAt?: string;
};

export type AnalyzePlaybookArtifactsResult = {
  metaDir: string;
  findingsPath: string;
  patternsPath: string;
  telemetryPath: string;
  proposalPaths: string[];
  findings: MetaFindingsArtifact;
  patterns: MetaPatternsArtifact;
  telemetry: MetaTelemetryArtifact;
};

export const analyzePlaybookArtifacts = (input: AnalyzePlaybookArtifactsInput): AnalyzePlaybookArtifactsResult => {
  const root = input.repoRoot;
  const playbookDir = path.join(root, '.playbook');
  const demoDir = path.join(playbookDir, 'demo-artifacts');
  const createdAt = input.createdAt ?? new Date().toISOString();

  const runCycles = readMany<RunCycle>([
    ...collectJsonFiles(path.join(playbookDir, 'run-cycles')),
    path.join(demoDir, 'run-cycle.example.json')
  ]);

  const graphSnapshots = readMany<GraphSnapshot>([
    ...collectJsonFiles(path.join(playbookDir, 'graph', 'snapshots')),
    path.join(demoDir, 'graph-memory.example.json')
  ]);

  const groups = readMany<GraphGroupArtifact>([
    ...collectJsonFiles(path.join(playbookDir, 'graph', 'groups')),
    path.join(demoDir, 'graph-groups.example.json')
  ]);

  const candidatePatterns = readMany<CandidatePatternPreviewArtifact>([
    ...collectJsonFiles(path.join(playbookDir, 'compaction', 'candidate-patterns')),
    path.join(demoDir, 'candidate-patterns.example.json')
  ]);

  const patternCards = readMany<PatternCardCollectionArtifact>([
    ...collectJsonFiles(path.join(playbookDir, 'pattern-cards', 'promoted')),
    path.join(demoDir, 'promoted-pattern-card.example.json')
  ]);

  const promotionDecisions = readMany<PromotionDecisionArtifact>([
    ...collectJsonFiles(path.join(playbookDir, 'promotion', 'decisions')),
    path.join(demoDir, 'promotion-decisions.example.json')
  ]);

  const contractHistory = readMany<ContractProposal>([
    ...collectJsonFiles(path.join(playbookDir, 'contracts', 'proposals')),
    path.join(demoDir, 'contract-proposal.example.json')
  ]);

  const analysisInput = {
    runCycles,
    graphSnapshots,
    groups,
    candidatePatterns,
    patternCards,
    promotionDecisions,
    contractHistory,
    createdAt
  };

  const findings = buildMetaFindings(analysisInput);
  const patterns = buildMetaPatterns(analysisInput);
  const telemetry = buildMetaTelemetry(analysisInput);

  const metaDir = path.join(playbookDir, 'meta');
  const proposalDir = path.join(metaDir, 'proposals');
  ensureDir(metaDir);

  const findingsPath = path.join(metaDir, 'meta-findings.json');
  const patternsPath = path.join(metaDir, 'meta-patterns.json');
  const telemetryPath = path.join(metaDir, 'meta-telemetry.json');

  writeArtifact(findingsPath, findings);
  writeArtifact(patternsPath, patterns);
  writeArtifact(telemetryPath, telemetry);
  const proposalPaths = writeProposals(proposalDir, findings.proposals);

  return {
    metaDir,
    findingsPath,
    patternsPath,
    telemetryPath,
    proposalPaths,
    findings,
    patterns,
    telemetry
  };
};
