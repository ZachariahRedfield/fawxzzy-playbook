import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  fitnessIntegrationContract,
  getFitnessActionContract,
  getFitnessReceiptTypeForAction,
  isFitnessActionName,
  validateFitnessActionInput,
  type FitnessActionInput,
  type FitnessActionName
} from '../integrations/fitnessContract.js';
import { getDefaultAiContract, loadAiContract } from './aiContract.js';

export const AI_PROPOSAL_SCHEMA_VERSION = '1.0' as const;
export const AI_PROPOSAL_DEFAULT_FILE = '.playbook/ai-proposal.json' as const;
const AI_CONTEXT_FILE = '.playbook/ai-context.json' as const;
const FITNESS_CONTRACT_CANONICAL_INPUT = 'playbook-engine:fitnessIntegrationContract';

type OptionalProposalSurface = 'plan' | 'review' | 'rendezvous' | 'interop';
export type AiProposalTarget = 'general' | 'fitness';

type ProposalProvenanceEntry = {
  artifactPath: string;
  source: 'file' | 'generated';
  required: boolean;
  available: boolean;
  used: boolean;
};

type FitnessRoutingMetadataSummary = {
  channel: string;
  target: string;
  priority: string;
  maxDeliveryLatencySeconds: number;
  constraints: string[];
};

export type FitnessRequestSuggestion = {
  canonicalActionName: FitnessActionName;
  boundedActionInput: FitnessActionInput;
  canonicalExpectedReceiptType: string;
  routingMetadataSummary: FitnessRoutingMetadataSummary;
  recommendedNextGovernedSurface: 'interop emit-fitness-plan';
  blockers: string[];
  assumptions: string[];
  confidence: number;
};

export type AiProposal = {
  schemaVersion: typeof AI_PROPOSAL_SCHEMA_VERSION;
  command: 'ai-propose';
  proposalId: string;
  scope: {
    mode: 'proposal-only';
    boundaries: [
      'no-direct-apply',
      'no-memory-promotion',
      'no-pattern-promotion',
      'no-external-interop-emit',
      'artifact-only-output'
    ];
    allowedInputs: string[];
    optionalInputs: string[];
    target: AiProposalTarget;
  };
  reasoningSummary: string[];
  recommendedNextGovernedSurface: 'route' | 'plan' | 'review-pr' | 'verify' | 'interop emit-fitness-plan';
  suggestedArtifactPath: string;
  blockers: string[];
  assumptions: string[];
  confidence: number;
  provenance: ProposalProvenanceEntry[];
  fitnessRequestSuggestion?: FitnessRequestSuggestion;
};

export type GenerateAiProposalOptions = {
  include?: OptionalProposalSurface[];
  target?: AiProposalTarget;
};

const OPTIONAL_SURFACE_PATHS: Record<OptionalProposalSurface, string> = {
  plan: '.playbook/plan.json',
  review: '.playbook/pr-review.json',
  rendezvous: '.playbook/rendezvous-manifest.json',
  interop: '.playbook/lifeline-interop-runtime.json'
};

const maybeReadJson = (cwd: string, relativePath: string): { found: boolean; parsed: unknown } => {
  const absolutePath = path.join(cwd, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return { found: false, parsed: null };
  }

  try {
    return { found: true, parsed: JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as unknown };
  } catch {
    return { found: true, parsed: null };
  }
};

const normalizeInclude = (include: OptionalProposalSurface[] | undefined): OptionalProposalSurface[] => {
  if (!include || include.length === 0) {
    return [];
  }

  return Array.from(new Set(include)).sort((left, right) => left.localeCompare(right));
};

const getDeterministicFieldValue = (field: {
  name: string;
  type: 'string' | 'number';
  min?: number;
  max?: number;
  allowedValues?: readonly string[];
}): unknown => {
  if (field.type === 'number') {
    if (typeof field.min === 'number') return field.min;
    if (typeof field.max === 'number' && field.max < 0) return field.max;
    return 0;
  }

  if (Array.isArray(field.allowedValues) && field.allowedValues.length > 0) {
    return field.allowedValues[0];
  }

  return `${field.name}_value`;
};

const buildDeterministicFitnessSuggestion = (): FitnessRequestSuggestion | null => {
  const canonicalActionName = fitnessIntegrationContract.actions[0]?.name;
  if (!canonicalActionName || !isFitnessActionName(canonicalActionName)) {
    return null;
  }

  const action = getFitnessActionContract(canonicalActionName);
  const boundedActionInput = Object.fromEntries(
    action.input.fields.map((field) => [field.name, getDeterministicFieldValue(field)])
  );

  const validation = validateFitnessActionInput(canonicalActionName, boundedActionInput);
  if (!validation.valid) {
    return null;
  }

  return {
    canonicalActionName,
    boundedActionInput,
    canonicalExpectedReceiptType: getFitnessReceiptTypeForAction(canonicalActionName),
    routingMetadataSummary: {
      channel: action.routing.channel,
      target: action.routing.target,
      priority: action.routing.priority,
      maxDeliveryLatencySeconds: action.routing.maxDeliveryLatencySeconds,
      constraints: [...action.constraints]
    },
    recommendedNextGovernedSurface: 'interop emit-fitness-plan',
    blockers: [],
    assumptions: [
      'Suggestion is bounded to canonical Fitness actions and input fields.',
      'No request emission is performed by ai propose; operators must run interop emit-fitness-plan explicitly.'
    ],
    confidence: 0.84
  };
};

export const generateAiProposal = (
  cwd: string,
  options: GenerateAiProposalOptions = {}
): AiProposal => {
  const include = normalizeInclude(options.include);
  const target = options.target ?? 'general';

  const contextPayload = maybeReadJson(cwd, AI_CONTEXT_FILE);
  const loadedContract = loadAiContract(cwd);
  const contract = loadedContract.contract;
  const defaultContract = getDefaultAiContract();

  const repoIndexPath = contract.intelligence_sources.repoIndex || defaultContract.intelligence_sources.repoIndex;
  const repoIndexPayload = maybeReadJson(cwd, repoIndexPath);

  const requestedOptionalSurfaces = include.map((surface) => ({
    surface,
    path: OPTIONAL_SURFACE_PATHS[surface],
    ...maybeReadJson(cwd, OPTIONAL_SURFACE_PATHS[surface])
  }));

  const provenance: ProposalProvenanceEntry[] = [
    {
      artifactPath: AI_CONTEXT_FILE,
      source: contextPayload.found ? 'file' : 'generated',
      required: true,
      available: contextPayload.found,
      used: true
    },
    {
      artifactPath: '.playbook/ai-contract.json',
      source: loadedContract.source,
      required: true,
      available: true,
      used: true
    },
    {
      artifactPath: repoIndexPath,
      source: 'file',
      required: true,
      available: repoIndexPayload.found,
      used: true
    },
    ...requestedOptionalSurfaces.map((entry) => ({
      artifactPath: entry.path,
      source: 'file' as const,
      required: false,
      available: entry.found,
      used: true
    }))
  ];

  if (target === 'fitness') {
    provenance.push({
      artifactPath: FITNESS_CONTRACT_CANONICAL_INPUT,
      source: 'generated',
      required: true,
      available: true,
      used: true
    });
  }

  const blockers: string[] = [];
  if (!repoIndexPayload.found) {
    blockers.push('Missing .playbook/repo-index.json; run `pnpm playbook index --json` before routing proposal work.');
  }

  for (const entry of requestedOptionalSurfaces) {
    if (!entry.found) {
      blockers.push(`Requested optional artifact is missing: ${entry.path}.`);
    }
  }

  const assumptions = [
    'AI proposals are advisory-only and must flow through route/plan/review/apply boundaries.',
    'No state mutation is authorized beyond explicit proposal artifact writes.',
    'Any execution or interop emits require explicit downstream governed commands.'
  ];

  if (target === 'fitness') {
    assumptions.push('Fitness-targeted proposals may interpret canonical Fitness contracts but may not emit requests directly.');
  }

  const contextSource = contextPayload.found ? 'file-backed ai-context' : 'generated ai-context fallback';
  const contractSource = loadedContract.source === 'file' ? 'file-backed ai-contract' : 'generated ai-contract fallback';

  const fitnessRequestSuggestion = target === 'fitness' ? buildDeterministicFitnessSuggestion() : undefined;
  if (target === 'fitness' && !fitnessRequestSuggestion) {
    blockers.push('Unable to build a canonical Fitness request suggestion from the mirrored Fitness contract.');
  }

  const reasoningSummary = [
    `Constructed proposal from ${contextSource}, ${contractSource}, and ${repoIndexPath}.`,
    `Canonical remediation sequence remains ${contract.remediation.canonicalFlow.join(' -> ')}.`,
    include.length > 0
      ? `Optional artifact summaries requested: ${include.join(', ')}.`
      : 'No optional plan/review/rendezvous/interop summaries were requested.',
    target === 'fitness'
      ? 'Fitness target requested: emitted proposal-only bounded suggestion validated against canonical Fitness contract mirror.'
      : 'General target requested: no external bounded action suggestion generated.',
    blockers.length > 0
      ? 'Proposal is blocked on missing required/optional artifacts; route first to collect governed evidence.'
      : 'Proposal has enough governed evidence to route into plan/review surfaces.'
  ];

  const availableCount = provenance.filter((entry) => entry.available).length;
  const confidenceRaw = availableCount / Math.max(provenance.length, 1) - blockers.length * 0.1;
  const confidence = Math.max(0.1, Math.min(0.99, Number(confidenceRaw.toFixed(2))));

  const recommendedNextGovernedSurface: AiProposal['recommendedNextGovernedSurface'] = target === 'fitness' && fitnessRequestSuggestion
    ? 'interop emit-fitness-plan'
    : blockers.length > 0
      ? 'route'
      : include.includes('review')
        ? 'review-pr'
        : 'plan';

  const fingerprintSeed = JSON.stringify({
    contextSource,
    contractSource,
    repoIndexAvailable: repoIndexPayload.found,
    include,
    target,
    blockers,
    recommendedNextGovernedSurface,
    fitnessRequestSuggestion
  });

  const proposalId = `ai-proposal-${createHash('sha256').update(fingerprintSeed).digest('hex').slice(0, 12)}`;

  return {
    schemaVersion: AI_PROPOSAL_SCHEMA_VERSION,
    command: 'ai-propose',
    proposalId,
    scope: {
      mode: 'proposal-only',
      boundaries: [
        'no-direct-apply',
        'no-memory-promotion',
        'no-pattern-promotion',
        'no-external-interop-emit',
        'artifact-only-output'
      ],
      allowedInputs: target === 'fitness'
        ? [AI_CONTEXT_FILE, '.playbook/ai-contract.json', repoIndexPath, FITNESS_CONTRACT_CANONICAL_INPUT]
        : [AI_CONTEXT_FILE, '.playbook/ai-contract.json', repoIndexPath],
      optionalInputs: requestedOptionalSurfaces.map((entry) => entry.path),
      target
    },
    reasoningSummary,
    recommendedNextGovernedSurface,
    suggestedArtifactPath: AI_PROPOSAL_DEFAULT_FILE,
    blockers,
    assumptions,
    confidence,
    provenance,
    ...(fitnessRequestSuggestion ? { fitnessRequestSuggestion } : {})
  };
};
