import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Source of truth:
 * - fawxzzy-fitness/src/lib/ecosystem/contract-types.ts
 * - fawxzzy-fitness/src/lib/ecosystem/fitness-integration-contract.ts
 *
 * Sync boundary:
 * - Playbook and Fitness live in separate repositories, so this file mirrors the Fitness-owned contract shape exactly.
 *
 * Rule:
 * - Do not rename fields, widen enums, or reinterpret semantics here.
 */

export const fitnessIntegrationContract = {
  schemaVersion: '1.0',
  kind: 'fitness-integration-contract',
  governance: {
    loop: 'signal->plan->action->receipt',
    seam: 'playbook-lifeline',
    bypassAllowed: false
  },
  signalTypes: [
    'fitness.session.events',
    'fitness.recovery.events',
    'fitness.goal.events'
  ],
  stateSnapshotTypes: [
    'fitness.session.snapshot',
    'fitness.recovery.snapshot',
    'fitness.goal.snapshot'
  ],
  actions: [
    {
      name: 'adjust_upcoming_workout_load',
      receiptType: 'schedule_adjustment_applied',
      routing: {
        topic: 'fitness.actions.training-load',
        must_route_through_playbook_plan: true,
        no_direct_lifeline_bypass: true
      },
      constraints: ['same_week_only', 'max_duration_days_14'],
      input: {
        fields: [
          { name: 'athlete_id', type: 'string', required: true },
          { name: 'week_id', type: 'string', required: true },
          { name: 'workout_id', type: 'string', required: true },
          { name: 'load_adjustment_percent', type: 'number', required: true, min: -40, max: 40 },
          { name: 'duration_days', type: 'number', required: true, min: 1, max: 14 },
          {
            name: 'reason_code',
            type: 'string',
            required: true,
            allowedValues: ['fatigue_spike', 'session_missed', 'readiness_drop']
          }
        ]
      }
    },
    {
      name: 'schedule_recovery_block',
      receiptType: 'recovery_guardrail_applied',
      routing: {
        topic: 'fitness.actions.recovery',
        must_route_through_playbook_plan: true,
        no_direct_lifeline_bypass: true
      },
      constraints: ['same_week_only', 'max_duration_days_14'],
      input: {
        fields: [
          { name: 'athlete_id', type: 'string', required: true },
          { name: 'week_id', type: 'string', required: true },
          { name: 'start_date', type: 'string', required: true },
          { name: 'duration_days', type: 'number', required: true, min: 1, max: 14 },
          {
            name: 'recovery_mode',
            type: 'string',
            required: true,
            allowedValues: ['rest', 'deload', 'active_recovery']
          }
        ]
      }
    },
    {
      name: 'revise_weekly_goal_plan',
      receiptType: 'goal_plan_amended',
      routing: {
        topic: 'fitness.actions.weekly-plan',
        must_route_through_playbook_plan: true,
        no_direct_lifeline_bypass: true
      },
      constraints: ['same_week_only', 'max_duration_days_14'],
      input: {
        fields: [
          { name: 'athlete_id', type: 'string', required: true },
          { name: 'week_id', type: 'string', required: true },
          {
            name: 'goal_domain',
            type: 'string',
            required: true,
            allowedValues: ['volume', 'intensity', 'consistency']
          },
          { name: 'target_value', type: 'number', required: true, min: 0, max: 1000 },
          { name: 'duration_days', type: 'number', required: true, min: 1, max: 14 }
        ]
      }
    }
  ],
  receiptTypes: [
    'schedule_adjustment_applied',
    'recovery_guardrail_applied',
    'goal_plan_amended'
  ]
} as const;

export type FitnessIntegrationContract = typeof fitnessIntegrationContract;
export type FitnessActionName = FitnessIntegrationContract['actions'][number]['name'];
export type FitnessReceiptType = FitnessIntegrationContract['actions'][number]['receiptType'];

const actionByName = new Map(
  fitnessIntegrationContract.actions.map((action) => [action.name, action])
);

export const isFitnessActionName = (value: string): value is FitnessActionName => actionByName.has(value as FitnessActionName);

export const getFitnessActionContract = (actionName: FitnessActionName) => actionByName.get(actionName)!;

export const getFitnessReceiptTypeForAction = (actionName: FitnessActionName): FitnessReceiptType =>
  getFitnessActionContract(actionName).receiptType;

export type FitnessContractSyncMode = 'direct' | 'mirrored';

export type FitnessContractSourcePointer = {
  sourceRepo: string;
  sourceRef: string;
  sourcePath: string;
  syncMode: FitnessContractSyncMode;
  expectedFingerprint?: string;
};

export type LoadedFitnessContract = {
  source: {
    sourceRepo: string;
    sourceRef: string;
    sourcePath: string;
    resolvedPath: string;
    syncMode: FitnessContractSyncMode;
  };
  fingerprint: string;
  payload: FitnessIntegrationContract;
};

export type MaterializedFitnessContractArtifact = {
  schemaVersion: '1.0';
  kind: 'fitness-contract-artifact';
  source: {
    sourceRepo: string;
    sourceRef: string;
    sourcePath: string;
    resolvedPath: string;
    syncMode: FitnessContractSyncMode;
  };
  fingerprint: string;
  payload: FitnessIntegrationContract;
};

type FitnessConfigContractSource = {
  sourceRepo?: unknown;
  sourceRef?: unknown;
  sourcePath?: unknown;
  syncMode?: unknown;
  expectedFingerprint?: unknown;
};

type FitnessConfigShape = {
  fitnessContractSource?: FitnessConfigContractSource;
};

const ENGINE_SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_REPO_ROOT = path.resolve(ENGINE_SRC_DIR, '../../..');
const FITNESS_CONTRACT_ARTIFACT_PATH = '.playbook/fitness-contract.json';

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const computeFitnessContractFingerprint = (payload: unknown): string =>
  createHash('sha256').update(stableStringify(payload)).digest('hex');

const parseSourcePointer = (candidate: FitnessConfigContractSource | undefined): FitnessContractSourcePointer => {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Fitness contract source pointer is missing in playbook.fitness.config.json at fitnessContractSource.');
  }

  const sourceRepo = candidate.sourceRepo;
  const sourceRef = candidate.sourceRef;
  const sourcePath = candidate.sourcePath;
  const syncMode = candidate.syncMode;
  const expectedFingerprint = candidate.expectedFingerprint;

  if (typeof sourceRepo !== 'string' || sourceRepo.trim().length === 0) {
    throw new Error('fitnessContractSource.sourceRepo must be a non-empty string.');
  }
  if (typeof sourceRef !== 'string' || sourceRef.trim().length === 0) {
    throw new Error('fitnessContractSource.sourceRef must be a non-empty string.');
  }
  if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
    throw new Error('fitnessContractSource.sourcePath must be a non-empty string.');
  }
  if (syncMode !== 'direct' && syncMode !== 'mirrored') {
    throw new Error('fitnessContractSource.syncMode must be either "direct" or "mirrored".');
  }
  if (expectedFingerprint !== undefined && typeof expectedFingerprint !== 'string') {
    throw new Error('fitnessContractSource.expectedFingerprint must be a string when provided.');
  }

  return {
    sourceRepo,
    sourceRef,
    sourcePath,
    syncMode,
    expectedFingerprint
  };
};

const readPointerFromConfig = (repoRoot: string): FitnessContractSourcePointer => {
  const configPath = path.join(repoRoot, 'playbook.fitness.config.json');
  if (!existsSync(configPath)) {
    throw new Error(`Fitness config not found: ${configPath}`);
  }
  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as FitnessConfigShape;
  return parseSourcePointer(parsed.fitnessContractSource);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertExactKeys = (label: string, value: Record<string, unknown>, expectedKeys: readonly string[]): void => {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} drift detected. Expected keys [${expected.join(', ')}], received [${actual.join(', ')}].`);
  }
};

export function validateFitnessContractExactShape(payload: unknown): asserts payload is FitnessIntegrationContract {
  if (!isRecord(payload)) {
    throw new Error('Fitness contract drift detected. Contract payload must be an object.');
  }
  assertExactKeys('fitness contract', payload, [
    'schemaVersion',
    'kind',
    'governance',
    'signalTypes',
    'stateSnapshotTypes',
    'actions',
    'receiptTypes'
  ]);
  if (!isRecord(payload.governance)) {
    throw new Error('Fitness contract drift detected at governance (must be object).');
  }
  assertExactKeys('fitness contract governance', payload.governance, ['loop', 'seam', 'bypassAllowed']);

  if (!Array.isArray(payload.signalTypes) || !payload.signalTypes.every((entry) => typeof entry === 'string')) {
    throw new Error('Fitness contract drift detected at signalTypes (must be string array).');
  }
  if (!Array.isArray(payload.stateSnapshotTypes) || !payload.stateSnapshotTypes.every((entry) => typeof entry === 'string')) {
    throw new Error('Fitness contract drift detected at stateSnapshotTypes (must be string array).');
  }
  if (!Array.isArray(payload.receiptTypes) || !payload.receiptTypes.every((entry) => typeof entry === 'string')) {
    throw new Error('Fitness contract drift detected at receiptTypes (must be string array).');
  }
  if (!Array.isArray(payload.actions) || payload.actions.length === 0) {
    throw new Error('Fitness contract drift detected at actions (must be non-empty array).');
  }
  for (const action of payload.actions) {
    if (!isRecord(action)) {
      throw new Error('Fitness contract drift detected at actions entry (must be object).');
    }
    assertExactKeys('fitness contract action', action, ['name', 'receiptType', 'routing', 'constraints', 'input']);
    if (!isRecord(action.routing)) {
      throw new Error('Fitness contract drift detected at action.routing (must be object).');
    }
    assertExactKeys('fitness contract action.routing', action.routing, [
      'topic',
      'must_route_through_playbook_plan',
      'no_direct_lifeline_bypass'
    ]);
    if (!Array.isArray(action.constraints) || !action.constraints.every((entry) => typeof entry === 'string')) {
      throw new Error('Fitness contract drift detected at action.constraints (must be string array).');
    }
    if (!isRecord(action.input)) {
      throw new Error('Fitness contract drift detected at action.input (must be object).');
    }
    assertExactKeys('fitness contract action.input', action.input, ['fields']);
    if (!Array.isArray(action.input.fields) || action.input.fields.length === 0) {
      throw new Error('Fitness contract drift detected at action.input.fields (must be non-empty array).');
    }
    for (const field of action.input.fields) {
      if (!isRecord(field)) {
        throw new Error('Fitness contract drift detected at action.input.fields entry (must be object).');
      }
      const allowed = ['name', 'type', 'required', 'min', 'max', 'allowedValues'];
      const keys = Object.keys(field);
      if (!keys.every((key) => allowed.includes(key))) {
        throw new Error(`Fitness contract drift detected at action.input.fields entry. Unexpected key in [${keys.join(', ')}].`);
      }
    }
  }
}

const loadDirectFitnessPayload = async (resolvedPath: string): Promise<unknown> => {
  if (!existsSync(resolvedPath)) {
    throw new Error(`Fitness contract sourcePath does not exist for direct sync: ${resolvedPath}`);
  }
  if (resolvedPath.endsWith('.json')) {
    return JSON.parse(readFileSync(resolvedPath, 'utf8'));
  }

  const moduleUrl = pathToFileURL(resolvedPath).href;
  const loaded = (await import(moduleUrl)) as {
    fitnessIntegrationContract?: unknown;
    default?: unknown;
  };
  const directPayload = loaded.fitnessIntegrationContract ?? (isRecord(loaded.default) ? loaded.default.fitnessIntegrationContract : undefined) ?? loaded.default;
  if (!directPayload) {
    throw new Error(
      `Direct fitness contract import failed for ${resolvedPath}. Expected export "fitnessIntegrationContract" or default export payload.`
    );
  }
  return directPayload;
};

export const loadFitnessContract = async (options?: {
  repoRoot?: string;
  sourcePointer?: FitnessContractSourcePointer;
}): Promise<LoadedFitnessContract> => {
  const repoRoot = options?.repoRoot ? path.resolve(options.repoRoot) : ENGINE_REPO_ROOT;
  const sourcePointer = options?.sourcePointer ?? readPointerFromConfig(repoRoot);
  const resolvedPath = path.resolve(repoRoot, sourcePointer.sourcePath);

  const payload: unknown =
    sourcePointer.syncMode === 'direct'
      ? await loadDirectFitnessPayload(resolvedPath)
      : fitnessIntegrationContract;

  validateFitnessContractExactShape(payload);

  const fingerprint = computeFitnessContractFingerprint(payload);
  if (sourcePointer.expectedFingerprint && sourcePointer.expectedFingerprint !== fingerprint) {
    throw new Error(
      `Fitness contract drift detected. expectedFingerprint=${sourcePointer.expectedFingerprint} actualFingerprint=${fingerprint}.`
    );
  }

  return {
    source: {
      sourceRepo: sourcePointer.sourceRepo,
      sourceRef: sourcePointer.sourceRef,
      sourcePath: sourcePointer.sourcePath,
      resolvedPath,
      syncMode: sourcePointer.syncMode
    },
    fingerprint,
    payload
  };
};

export const materializeFitnessContractArtifact = async (options?: {
  repoRoot?: string;
  sourcePointer?: FitnessContractSourcePointer;
  artifactPath?: string;
}): Promise<MaterializedFitnessContractArtifact> => {
  const repoRoot = options?.repoRoot ? path.resolve(options.repoRoot) : ENGINE_REPO_ROOT;
  const artifactPath = path.resolve(repoRoot, options?.artifactPath ?? FITNESS_CONTRACT_ARTIFACT_PATH);
  const loaded = await loadFitnessContract({
    repoRoot,
    sourcePointer: options?.sourcePointer
  });

  const artifact: MaterializedFitnessContractArtifact = {
    schemaVersion: '1.0',
    kind: 'fitness-contract-artifact',
    source: loaded.source,
    fingerprint: loaded.fingerprint,
    payload: loaded.payload
  };

  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
};
