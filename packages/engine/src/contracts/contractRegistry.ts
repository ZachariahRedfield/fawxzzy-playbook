import fs from 'node:fs';
import path from 'node:path';

type CliSchemasRegistry = {
  draft: '2020-12';
  schemaCommand: 'playbook schema --json';
  commands: string[];
};

type RuntimeDefaultArtifact = {
  path: string;
  producer: string;
};

type ContractArtifact = {
  path: string;
  available: boolean;
};

type RoadmapFeatureStatus = {
  featureId: string;
  status: string;
};

type RoadmapRegistry = {
  available: boolean;
  path: 'docs/roadmap/ROADMAP.json';
  schemaVersion: string | null;
  updatedAt: string | null;
  featureStatuses: RoadmapFeatureStatus[];
};

export type ContractRegistryPayload = {
  schemaVersion: '1.0';
  command: 'contracts';
  cliSchemas: CliSchemasRegistry;
  artifacts: {
    runtimeDefaults: RuntimeDefaultArtifact[];
    contracts: ContractArtifact[];
  };
  roadmap: RoadmapRegistry;
};

type RoadmapFeatureRecord = {
  feature_id?: unknown;
  status?: unknown;
};

type RoadmapFileRecord = {
  schemaVersion?: unknown;
  updatedAt?: unknown;
  features?: unknown;
};

const ROADMAP_RELATIVE_PATH = 'docs/roadmap/ROADMAP.json' as const;

const cliSchemaCommands = [
  'rules',
  'explain',
  'index',
  'graph',
  'verify',
  'plan',
  'context',
  'ai-context',
  'ai-contract',
  'doctor',
  'analyze-pr',
  'query',
  'docs',
  'contracts'
] as const;

const runtimeDefaults: RuntimeDefaultArtifact[] = [
  { path: '.playbook/repo-index.json', producer: 'index' },
  { path: '.playbook/repo-graph.json', producer: 'index' },
  { path: '.playbook/ai-contract.json', producer: 'ai-contract' },
  { path: '.playbook/contracts-registry.json', producer: 'contracts' }
];

const contractArtifacts = ['docs/contracts/COMMAND_CONTRACTS_V1.md', 'docs/contracts/ARTIFACT_EVOLUTION_POLICY.md'] as const;
const trackedRoadmapFeatures = ['PB-V04-PLAN-APPLY-001', 'PB-V04-ANALYZEPR-001', 'PB-V1-DELIVERY-SYSTEM-001'] as const;

const isRoadmapFeatureRecord = (value: unknown): value is RoadmapFeatureRecord => typeof value === 'object' && value !== null;

const buildRoadmapRegistry = (cwd: string): RoadmapRegistry => {
  const roadmapPath = path.join(cwd, ROADMAP_RELATIVE_PATH);
  if (!fs.existsSync(roadmapPath)) {
    return {
      available: false,
      path: ROADMAP_RELATIVE_PATH,
      schemaVersion: null,
      updatedAt: null,
      featureStatuses: []
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as RoadmapFileRecord;
    const featureList = Array.isArray(parsed.features) ? parsed.features : [];

    const featureStatuses = featureList
      .filter(isRoadmapFeatureRecord)
      .map((feature) => {
        const rawFeatureId = typeof feature.feature_id === 'string' ? feature.feature_id : null;
        const rawStatus = typeof feature.status === 'string' ? feature.status : null;
        if (!rawFeatureId || !rawStatus) {
          return null;
        }

        if (!trackedRoadmapFeatures.includes(rawFeatureId as (typeof trackedRoadmapFeatures)[number])) {
          return null;
        }

        return {
          featureId: rawFeatureId,
          status: rawStatus
        };
      })
      .filter((entry): entry is RoadmapFeatureStatus => entry !== null)
      .sort((left, right) => left.featureId.localeCompare(right.featureId));

    return {
      available: true,
      path: ROADMAP_RELATIVE_PATH,
      schemaVersion: typeof parsed.schemaVersion === 'string' ? parsed.schemaVersion : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      featureStatuses
    };
  } catch {
    return {
      available: false,
      path: ROADMAP_RELATIVE_PATH,
      schemaVersion: null,
      updatedAt: null,
      featureStatuses: []
    };
  }
};

export const buildContractRegistry = (cwd: string): ContractRegistryPayload => ({
  schemaVersion: '1.0',
  command: 'contracts',
  cliSchemas: {
    draft: '2020-12',
    schemaCommand: 'playbook schema --json',
    commands: [...cliSchemaCommands]
  },
  artifacts: {
    runtimeDefaults: [...runtimeDefaults].sort((left, right) => left.path.localeCompare(right.path)),
    contracts: [...contractArtifacts]
      .sort((left, right) => left.localeCompare(right))
      .map((contractPath) => ({
        path: contractPath,
        available: fs.existsSync(path.join(cwd, contractPath))
      }))
  },
  roadmap: buildRoadmapRegistry(cwd)
});
