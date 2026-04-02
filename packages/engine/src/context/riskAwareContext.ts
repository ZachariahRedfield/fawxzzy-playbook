import { readModuleDigestsArtifact, type ModuleDigest } from './moduleDigests.js';
import { readConsumedRuntimeManifestsArtifact } from './runtimeManifests.js';

export type RiskContextTier = 'high' | 'low';
export type RiskContextDepth = 'rich' | 'concise';

export type RiskAwareModuleContext = {
  module: string;
  shapedRiskTier: RiskContextTier;
  contextDepth: RiskContextDepth;
  rationale: string;
  provenanceRefs: string[];
  context: {
    summary: string;
    dependencies: string[];
    dependents: {
      direct: string[];
      transitive: string[];
    };
    risk: {
      level: ModuleDigest['risk']['level'];
      score: number;
      signals: string[];
    };
    ownership?: ModuleDigest['ownership'];
    keyReferences?: ModuleDigest['keyReferences'];
    runtime?: {
      manifestsCount: number;
      manifestIds: string[];
    };
  };
};

export type RiskAwareContextSummary = {
  artifact: '.playbook/module-digests.json';
  shapedAtDeterministic: true;
  modulesConsidered: number;
  highRiskModules: number;
  lowRiskModules: number;
  defaultDepthByTier: {
    high: RiskContextDepth;
    low: RiskContextDepth;
  };
  provenanceRefs: string[];
  modules: RiskAwareModuleContext[];
};

const toSortedUnique = (values: string[]): string[] => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

const toTier = (digest: ModuleDigest): RiskContextTier => {
  if (digest.risk.level === 'high' || digest.risk.score >= 0.6) {
    return 'high';
  }

  return 'low';
};

const toDepth = (tier: RiskContextTier): RiskContextDepth => (tier === 'high' ? 'rich' : 'concise');

export const shapeRiskAwareModuleContext = (
  digest: ModuleDigest,
  runtime?: { manifestsCount: number; manifestIds: string[] }
): RiskAwareModuleContext => {
  const shapedRiskTier = toTier(digest);
  const contextDepth = toDepth(shapedRiskTier);
  const conciseSignals = digest.risk.signals.slice(0, 2);

  return {
    module: digest.id,
    shapedRiskTier,
    contextDepth,
    rationale:
      shapedRiskTier === 'high'
        ? 'Elevated risk signals require richer module context for safe reasoning.'
        : 'Lower risk profile keeps module context concise for token-efficient reasoning.',
    provenanceRefs: toSortedUnique([
      digest.provenance.indexArtifact,
      digest.provenance.graphArtifact,
      '.playbook/module-digests.json',
      ...(runtime ? ['.playbook/runtime-manifests.json'] : [])
    ]),
    context: {
      summary: digest.summary,
      dependencies: contextDepth === 'rich' ? digest.dependencies.direct : digest.dependencies.direct.slice(0, 3),
      dependents: {
        direct: contextDepth === 'rich' ? digest.dependents.direct : digest.dependents.direct.slice(0, 3),
        transitive: contextDepth === 'rich' ? digest.dependents.transitive : []
      },
      risk: {
        level: digest.risk.level,
        score: digest.risk.score,
        signals: contextDepth === 'rich' ? digest.risk.signals : conciseSignals
      },
      ...(contextDepth === 'rich' ? { ownership: digest.ownership, keyReferences: digest.keyReferences } : {}),
      ...(runtime
        ? {
            runtime: {
              manifestsCount: runtime.manifestsCount,
              manifestIds: runtime.manifestIds
            }
          }
        : {})
    }
  };
};

export const buildRiskAwareContextSummary = (projectRoot: string): RiskAwareContextSummary | null => {
  const moduleDigests = readModuleDigestsArtifact(projectRoot);
  if (!moduleDigests) {
    return null;
  }

  const runtimeArtifact = readConsumedRuntimeManifestsArtifact(projectRoot);
  const runtime = runtimeArtifact.manifests.length > 0
    ? {
        manifestsCount: runtimeArtifact.manifests.length,
        manifestIds: toSortedUnique(runtimeArtifact.manifests.map((entry) => entry.subapp_id))
      }
    : undefined;

  const modules = [...moduleDigests.modules]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((digest) => shapeRiskAwareModuleContext(digest, runtime));

  const highRiskModules = modules.filter((entry) => entry.shapedRiskTier === 'high').length;

  return {
    artifact: '.playbook/module-digests.json',
    shapedAtDeterministic: true,
    modulesConsidered: modules.length,
    highRiskModules,
    lowRiskModules: modules.length - highRiskModules,
    defaultDepthByTier: {
      high: 'rich',
      low: 'concise'
    },
    provenanceRefs: toSortedUnique([
      '.playbook/repo-index.json',
      '.playbook/repo-graph.json',
      '.playbook/module-digests.json',
      ...(runtime ? ['.playbook/runtime-manifests.json'] : [])
    ]),
    modules
  };
};
