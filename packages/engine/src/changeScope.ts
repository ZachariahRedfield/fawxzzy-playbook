import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AnalyzePullRequestResult } from './pr/analyzePr.js';
import type { WorkerLaunchPlanArtifact } from './orchestration/workerLaunchPlan.js';
import type { AiProposal } from './ai/aiProposal.js';

export const CHANGE_SCOPE_SCHEMA_VERSION = '1.0' as const;
export const CHANGE_SCOPE_RELATIVE_PATH = '.playbook/change-scope.json' as const;

export type ChangeScopeRiskLevel = 'low' | 'medium' | 'high';

export type PatchSizeBudget = {
  maxFiles: number;
  maxHunks: number;
  maxAddedLines: number;
  maxRemovedLines: number;
};

export type MutationScopeDeclaration = {
  allowedFiles: string[];
  patchSizeBudget: PatchSizeBudget;
  boundaryChecks: string[];
};

export type ChangeScopeBundle = {
  scopeId: string;
  source: {
    command: 'plan' | 'analyze-pr' | 'workers launch-plan' | 'ai propose';
    artifactPath: string;
  };
  mutationScope: MutationScopeDeclaration;
  expectedTests: string[];
  docsSurfaces: string[];
  rulesTouched: string[];
  riskLevel: ChangeScopeRiskLevel;
  rationale: string;
  provenanceRefs: string[];
};

export type ChangeScopeArtifact = {
  schemaVersion: typeof CHANGE_SCOPE_SCHEMA_VERSION;
  kind: 'change-scope';
  generatedAt: string;
  bundles: ChangeScopeBundle[];
};

type PlanLikePayload = {
  tasks?: Array<{ file?: string | null; ruleId?: string; action?: string }>;
};

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));

const scoreToRisk = (score: number): ChangeScopeRiskLevel => {
  if (score >= 5) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
};

const createScopeId = (seed: string): string => `scope-${createHash('sha256').update(seed).digest('hex').slice(0, 12)}`;

const budgetFromFiles = (allowedFiles: string[], riskLevel: ChangeScopeRiskLevel): PatchSizeBudget => {
  const fileCount = Math.max(allowedFiles.length, 1);
  const multiplier = riskLevel === 'high' ? 1.4 : riskLevel === 'medium' ? 1.1 : 0.9;

  return {
    maxFiles: fileCount,
    maxHunks: Math.max(3, Math.round(fileCount * 4 * multiplier)),
    maxAddedLines: Math.max(40, Math.round(fileCount * 120 * multiplier)),
    maxRemovedLines: Math.max(20, Math.round(fileCount * 90 * multiplier))
  };
};

const expectedTestsFromFiles = (allowedFiles: string[]): string[] => {
  const tests = allowedFiles.filter((entry) => /(test|spec)\.[cm]?[jt]sx?$/i.test(entry));
  if (tests.length > 0) return uniqueSorted(tests);

  if (allowedFiles.some((entry) => entry.startsWith('packages/cli/src/commands/'))) {
    return ['pnpm --filter @fawxzzy/playbook-cli test'];
  }
  if (allowedFiles.some((entry) => entry.startsWith('packages/engine/src/'))) {
    return ['pnpm --filter @zachariahredfield/playbook-engine test'];
  }
  return [];
};

const defaultBoundaryChecks = (allowedFiles: string[]): string[] => uniqueSorted([
  'same-inputs-produce-same-change-scope-artifact',
  'no-mutation-authority-escalation',
  ...(allowedFiles.length > 0 ? ['writes-must-stay-inside-allowedFiles'] : ['proposal-only-no-write-authority'])
]);

const buildBundle = (input: {
  command: ChangeScopeBundle['source']['command'];
  artifactPath: string;
  allowedFiles: string[];
  rulesTouched: string[];
  riskLevel: ChangeScopeRiskLevel;
  rationale: string;
  provenanceRefs: string[];
  boundaryChecks?: string[];
  expectedTests?: string[];
  docsSurfaces?: string[];
}): ChangeScopeBundle => {
  const allowedFiles = uniqueSorted(input.allowedFiles);
  const rulesTouched = uniqueSorted(input.rulesTouched);
  const docsSurfaces = uniqueSorted(input.docsSurfaces ?? allowedFiles.filter((entry) => entry.startsWith('docs/')));
  const expectedTests = uniqueSorted(input.expectedTests ?? expectedTestsFromFiles(allowedFiles));
  const boundaryChecks = uniqueSorted(input.boundaryChecks ?? defaultBoundaryChecks(allowedFiles));

  const seed = [input.command, input.artifactPath, ...allowedFiles, ...rulesTouched, input.riskLevel, ...boundaryChecks].join('|');

  return {
    scopeId: createScopeId(seed),
    source: {
      command: input.command,
      artifactPath: input.artifactPath
    },
    mutationScope: {
      allowedFiles,
      patchSizeBudget: budgetFromFiles(allowedFiles, input.riskLevel),
      boundaryChecks
    },
    expectedTests,
    docsSurfaces,
    rulesTouched,
    riskLevel: input.riskLevel,
    rationale: input.rationale,
    provenanceRefs: uniqueSorted(input.provenanceRefs)
  };
};

export const buildChangeScopeBundleFromPlan = (payload: PlanLikePayload): ChangeScopeBundle => {
  const allowedFiles = uniqueSorted((payload.tasks ?? []).flatMap((task) => (task.file ? [task.file] : [])));
  const rulesTouched = uniqueSorted((payload.tasks ?? []).flatMap((task) => (task.ruleId ? [task.ruleId] : [])));
  const riskScore = (payload.tasks ?? []).length >= 8 ? 5 : (payload.tasks ?? []).length >= 3 ? 2 : 1;

  return buildBundle({
    command: 'plan',
    artifactPath: '.playbook/plan.json',
    allowedFiles,
    rulesTouched,
    riskLevel: scoreToRisk(riskScore),
    rationale: 'Derived from deterministic plan tasks so downstream work can carry explicit mutation boundaries.',
    provenanceRefs: ['.playbook/plan.json', 'command:plan']
  });
};

export const buildChangeScopeBundleFromAnalyzePr = (payload: AnalyzePullRequestResult): ChangeScopeBundle => {
  const riskScore = payload.risk.level === 'high' ? 5 : payload.risk.level === 'medium' ? 3 : 1;
  return buildBundle({
    command: 'analyze-pr',
    artifactPath: '.playbook/analyze-pr.json',
    allowedFiles: payload.changedFiles,
    rulesTouched: payload.rules.related,
    riskLevel: scoreToRisk(riskScore),
    expectedTests: payload.reviewGuidance.filter((entry) => entry.toLowerCase().includes('test')),
    docsSurfaces: payload.docs.changed,
    rationale: 'Derived from deterministic PR intelligence so scope boundaries match observed change surfaces.',
    provenanceRefs: ['.playbook/repo-index.json', 'command:analyze-pr']
  });
};

export const buildChangeScopeBundleFromWorkerLaunchPlan = (payload: WorkerLaunchPlanArtifact): ChangeScopeBundle => {
  const allowedFiles = uniqueSorted(payload.lanes.flatMap((lane) => lane.allowedWriteSurfaces));
  const rulesTouched = uniqueSorted(payload.lanes.flatMap((lane) => lane.blockers.filter((entry) => entry.startsWith('verify:')).map((entry) => entry.replace(/^verify:/, ''))));
  const launchBlockedCount = payload.summary.blockedLanes.length;
  const riskScore = launchBlockedCount > 0 ? 3 : 1;

  return buildBundle({
    command: 'workers launch-plan',
    artifactPath: '.playbook/worker-launch-plan.json',
    allowedFiles,
    rulesTouched,
    riskLevel: scoreToRisk(riskScore),
    boundaryChecks: [
      'launch-authorization-must-remain-proposal-only',
      'writes-must-stay-inside-allowedFiles',
      'protected-doc-consolidation-must-be-resolved-before-mutation'
    ],
    rationale: 'Derived from lane launch authorization to preserve write-surface and blocker boundaries.',
    provenanceRefs: [
      '.playbook/workset-plan.json',
      '.playbook/lane-state.json',
      '.playbook/worker-assignments.json',
      '.playbook/worker-launch-plan.json',
      'command:workers launch-plan'
    ]
  });
};

export const buildChangeScopeBundleFromAiProposal = (payload: AiProposal): ChangeScopeBundle => {
  const provenanceFiles = payload.provenance.filter((entry) => entry.artifactPath.startsWith('.playbook/')).map((entry) => entry.artifactPath);
  const includesPlan = provenanceFiles.includes('.playbook/plan.json');

  return buildBundle({
    command: 'ai propose',
    artifactPath: '.playbook/ai-proposal.json',
    allowedFiles: includesPlan ? ['.playbook/ai-proposal.json'] : [],
    rulesTouched: [],
    riskLevel: 'low',
    boundaryChecks: [
      'proposal-only-no-direct-apply',
      'proposal-only-no-external-interop-emit',
      'artifact-only-output'
    ],
    rationale: 'Derived from AI proposal boundaries so advisory outputs carry explicit non-mutation scope declarations.',
    provenanceRefs: uniqueSorted(['command:ai propose', '.playbook/ai-proposal.json', ...provenanceFiles])
  });
};

export const writeChangeScopeArtifact = (cwd: string, bundle: ChangeScopeBundle, relativePath = CHANGE_SCOPE_RELATIVE_PATH): ChangeScopeArtifact => {
  const absolutePath = path.join(cwd, relativePath);
  const artifact: ChangeScopeArtifact = {
    schemaVersion: CHANGE_SCOPE_SCHEMA_VERSION,
    kind: 'change-scope',
    generatedAt: new Date(0).toISOString(),
    bundles: [bundle]
  };

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  return artifact;
};
