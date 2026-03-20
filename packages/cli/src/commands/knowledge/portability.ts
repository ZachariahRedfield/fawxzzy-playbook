import {
  readCrossRepoPatternsArtifact,
  readPortabilityOutcomesArtifact
} from '@zachariahredfield/playbook-engine';
import fs from 'node:fs';
import path from 'node:path';


type PortabilityRiskSignal = 'dependency mismatch' | 'outcome volatility' | 'low instance diversity' | 'governance instability';


type RecordedPortabilityOutcome = {
  recommendation_id: string;
  pattern_id: string;
  source_repo: string;
  target_repo: string;
  decision_status: 'proposed' | 'reviewed' | 'accepted' | 'rejected' | 'superseded';
  decision_reason?: string;
  adoption_status?: 'proposed' | 'reviewed' | 'accepted' | 'rejected' | 'adopted' | 'superseded';
  observed_outcome?: 'successful' | 'unsuccessful' | 'inconclusive';
  outcome_confidence?: number;
  timestamp: string;
};

type PortabilityOutcomesArtifact = { outcomes: RecordedPortabilityOutcome[] };

type PortabilityRecord = {
  pattern_id: string;
  source_repo: string;
  portability_score: number;
  evidence_runs: number;
  compatible_subsystems: string[];
  risk_signals: PortabilityRiskSignal[];
};

type PortabilityRecommendationRecord = {
  pattern: string;
  source_repo: string;
  target_repo: string;
  initial_portability_score: number;
  decision_status: 'recommended' | 'monitor';
  evidence_count: number;
};

type PortabilityOutcomeRecord = {
  recommendation_id: string;
  pattern: string;
  source_repo: string;
  target_repo: string;
  initial_portability_score: number;
  decision_status: 'proposed' | 'reviewed' | 'accepted' | 'rejected' | 'superseded';
  decision_reason?: string;
  adoption_status?: 'proposed' | 'reviewed' | 'accepted' | 'rejected' | 'adopted' | 'superseded';
  observed_outcome?: 'successful' | 'unsuccessful' | 'inconclusive';
  outcome_confidence?: number;
  timestamp: string;
  sample_size: number;
};

type PortabilityRecalibrationRecord = {
  pattern: string;
  source_repo: string;
  target_repo: string;
  initial_portability_score: number;
  recalibrated_confidence: number;
  evidence_count: number;
  sample_size: number;
};

type TransferPlanRecord = {
  transfer_plan_id: string;
  pattern: string;
  source_repo: string;
  target_repo: string;
  portability_confidence: number;
  readiness_score: number;
  touched_subsystems: string[];
  required_artifacts: string[];
  required_validations: string[];
  adoption_steps: string[];
  risk_signals: string[];
  blockers: string[];
  open_questions: string[];
  gating_tier: 'CONVERSATIONAL' | 'GOVERNANCE';
  proposal_only: true;
  non_autonomous: true;
};

type TransferReadinessRecord = {
  pattern: string;
  target_repo: string;
  readiness_score: number;
  recommendation: 'ready' | 'partial' | 'blocked';
  required_subsystems: string[];
  missing_subsystems: string[];
  required_artifacts: string[];
  missing_artifacts: string[];
  required_validations: string[];
  missing_validations: string[];
  required_contracts: string[];
  missing_contracts: string[];
  blockers: string[];
  missing_prerequisites: string[];
  open_questions: string[];
};

type TransferPlansArtifact = {
  schemaVersion: '1.0';
  kind: 'transfer-plans';
  generatedAt: string;
  plans: TransferPlanRecord[];
};

type TransferReadinessArtifact = {
  schemaVersion: '1.0';
  kind: 'transfer-readiness';
  generatedAt: string;
  target_repo: string;
  assessments: TransferReadinessRecord[];
};

type CrossRepoAggregate = {
  pattern_id: string;
  portability_score: number;
  repo_count: number;
  outcome_consistency: number;
  instance_diversity: number;
  governance_stability: number;
};

type CrossRepoRepository = {
  id: string;
  patterns: Array<{ pattern_id: string; strength: number; instance_count: number }>;
};

type CrossRepoPatternsArtifact = {
  aggregates: CrossRepoAggregate[];
  repositories: CrossRepoRepository[];
  portability_recommendations?: PortabilityRecommendationRecord[];
  portability_recalibration?: PortabilityRecalibrationRecord[];
};

export type PortabilityView =
  | 'overview'
  | 'recommendations'
  | 'outcomes'
  | 'recalibration'
  | 'transfer-plans'
  | 'readiness'
  | 'blocked-transfers';

const clamp = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(4))));

const TRANSFER_PLANS_RELATIVE_PATH = '.playbook/transfer-plans.json';
const TRANSFER_READINESS_RELATIVE_PATH = '.playbook/transfer-readiness.json';

const ensureArtifactExists = (cwd: string, relativePath: string): string => {
  const artifactPath = path.join(cwd, relativePath);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`playbook knowledge portability: missing artifact at ${relativePath}.`);
  }
  return artifactPath;
};

const asTextList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry));
};

const sortTransferPlans = (records: TransferPlanRecord[]): TransferPlanRecord[] =>
  [...records].sort(
    (left, right) =>
      right.portability_confidence - left.portability_confidence ||
      left.pattern.localeCompare(right.pattern) ||
      left.target_repo.localeCompare(right.target_repo)
  );

const readTransferPlansArtifact = (cwd: string): TransferPlansArtifact => {
  const artifactPath = ensureArtifactExists(cwd, TRANSFER_PLANS_RELATIVE_PATH);
  const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as Record<string, unknown>;
  const transferPlans = Array.isArray(parsed.plans) ? parsed.plans : Array.isArray(parsed.transfer_plans) ? parsed.transfer_plans : [];

  return {
    schemaVersion: '1.0',
    kind: 'transfer-plans',
    generatedAt: String(parsed.generatedAt ?? '1970-01-01T00:00:00.000Z'),
    plans: sortTransferPlans(
      transferPlans.map((entry: unknown) => {
        const typed = entry as Record<string, unknown>;
        return {
          transfer_plan_id: String(typed.transfer_plan_id ?? `${String(typed.pattern_id ?? typed.pattern ?? 'unknown')}::${String(typed.target_repo ?? 'unknown')}`),
          pattern: String(typed.pattern_id ?? typed.pattern ?? 'unknown'),
          source_repo: String(typed.source_repo ?? 'unknown'),
          target_repo: String(typed.target_repo ?? 'unknown'),
          portability_confidence: Number(typed.portability_confidence ?? 0),
          readiness_score: Number(typed.target_readiness ?? typed.readiness_score ?? 0),
          touched_subsystems: asTextList(typed.touched_subsystems),
          required_artifacts: asTextList(typed.required_artifacts),
          required_validations: asTextList(typed.required_validations),
          adoption_steps: asTextList(typed.adoption_steps),
          risk_signals: asTextList(typed.risk_signals),
          blockers: asTextList(typed.blockers),
          open_questions: asTextList(typed.open_questions),
          gating_tier: String(typed.gating_tier ?? 'GOVERNANCE') === 'CONVERSATIONAL' ? 'CONVERSATIONAL' : 'GOVERNANCE',
          proposal_only: true,
          non_autonomous: true
        };
      })
    )
  };
};

const sortTransferReadiness = (records: TransferReadinessRecord[]): TransferReadinessRecord[] =>
  [...records].sort(
    (left, right) =>
      right.readiness_score - left.readiness_score ||
      left.pattern.localeCompare(right.pattern) ||
      left.target_repo.localeCompare(right.target_repo)
  );

const readTransferReadinessArtifact = (cwd: string): TransferReadinessArtifact => {
  const artifactPath = ensureArtifactExists(cwd, TRANSFER_READINESS_RELATIVE_PATH);
  const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as Record<string, unknown>;
  const readiness = Array.isArray(parsed.assessments) ? parsed.assessments : Array.isArray(parsed.readiness) ? parsed.readiness : [];

  return {
    schemaVersion: '1.0',
    kind: 'transfer-readiness',
    generatedAt: String(parsed.generatedAt ?? '1970-01-01T00:00:00.000Z'),
    target_repo: String(parsed.target_repo ?? 'unknown'),
    assessments: sortTransferReadiness(
      readiness.map((entry: unknown) => {
        const typed = entry as Record<string, unknown>;
        const subsystemPresence = (typed.subsystem_presence ?? {}) as Record<string, unknown>;
        const artifactAvailability = (typed.artifact_availability ?? {}) as Record<string, unknown>;
        const validationCoverage = (typed.validation_coverage ?? {}) as Record<string, unknown>;
        const governanceAlignment = (typed.governance_alignment ?? {}) as Record<string, unknown>;
        return {
          pattern: String(typed.pattern_id ?? typed.pattern ?? 'unknown'),
          target_repo: String(typed.target_repo ?? parsed.target_repo ?? 'unknown'),
          readiness_score: Number(typed.readiness_score ?? 0),
          recommendation: String(typed.recommendation ?? 'partial') === 'ready' ? 'ready' : String(typed.recommendation ?? 'partial') === 'blocked' ? 'blocked' : 'partial',
          required_subsystems: asTextList(subsystemPresence.required),
          missing_subsystems: asTextList(subsystemPresence.missing),
          required_artifacts: asTextList(artifactAvailability.required),
          missing_artifacts: asTextList(artifactAvailability.missing),
          required_validations: asTextList(validationCoverage.required_validations ?? typed.required_validations),
          missing_validations: asTextList(validationCoverage.required_validations).filter((item) => !asTextList(validationCoverage.present_validations).includes(item)),
          required_contracts: asTextList(governanceAlignment.required_contracts),
          missing_contracts: asTextList(governanceAlignment.missing_contracts),
          blockers: asTextList(typed.blockers),
          missing_prerequisites: asTextList(typed.missing_prerequisites),
          open_questions: asTextList(typed.open_questions)
        };
      })
    )
  };
};

const inferCompatibleSubsystems = (patternId: string): string[] => {
  const tokenized = patternId.toLowerCase();
  const subsystems = new Set<string>();

  if (tokenized.includes('bootstrap') || tokenized.includes('contract')) {
    subsystems.add('bootstrap_contract_surface');
  }
  if (tokenized.includes('knowledge') || tokenized.includes('memory')) {
    subsystems.add('knowledge_lifecycle');
  }
  if (tokenized.includes('telemetry') || tokenized.includes('learning')) {
    subsystems.add('telemetry_learning');
  }
  if (tokenized.includes('route') || tokenized.includes('routing') || tokenized.includes('lane')) {
    subsystems.add('routing_engine');
  }

  return [...subsystems].sort((left, right) => left.localeCompare(right));
};

const inferRiskSignals = (entry: CrossRepoAggregate): PortabilityRiskSignal[] => {
  const risks = new Set<PortabilityRiskSignal>();

  if (entry.outcome_consistency < 0.8) {
    risks.add('dependency mismatch');
  }
  if (entry.outcome_consistency < 0.65) {
    risks.add('outcome volatility');
  }
  if (entry.instance_diversity < 0.6) {
    risks.add('low instance diversity');
  }
  if (entry.governance_stability < 0.75) {
    risks.add('governance instability');
  }

  return [...risks];
};

const resolveSourceRepo = (repositories: CrossRepoRepository[], patternId: string): string => {
  const ranked = repositories
    .map((repository) => ({
      id: repository.id,
      match: repository.patterns.find((pattern) => pattern.pattern_id === patternId)
    }))
    .filter((entry): entry is { id: string; match: { pattern_id: string; strength: number; instance_count: number } } => Boolean(entry.match))
    .sort((left, right) => right.match.strength - left.match.strength || right.match.instance_count - left.match.instance_count || left.id.localeCompare(right.id));

  return ranked[0]?.id ?? 'unknown';
};

const derivePortabilityRecords = (artifact: CrossRepoPatternsArtifact): PortabilityRecord[] =>
  artifact.aggregates.map((entry) => ({
    pattern_id: entry.pattern_id,
    source_repo: resolveSourceRepo(artifact.repositories, entry.pattern_id),
    portability_score: entry.portability_score,
    evidence_runs: entry.repo_count,
    compatible_subsystems: inferCompatibleSubsystems(entry.pattern_id),
    risk_signals: inferRiskSignals(entry)
  }));

const deriveRecommendations = (artifact: CrossRepoPatternsArtifact): PortabilityRecommendationRecord[] => {
  if (Array.isArray(artifact.portability_recommendations)) {
    return [...artifact.portability_recommendations];
  }

  const recommendations: PortabilityRecommendationRecord[] = [];
  for (const aggregate of artifact.aggregates) {
    const sourceRepo = resolveSourceRepo(artifact.repositories, aggregate.pattern_id);
    const reposWithPattern = new Set(
      artifact.repositories
        .filter((repository) => repository.patterns.some((pattern) => pattern.pattern_id === aggregate.pattern_id))
        .map((repository) => repository.id)
    );

    for (const repository of artifact.repositories) {
      if (reposWithPattern.has(repository.id)) {
        continue;
      }

      recommendations.push({
        pattern: aggregate.pattern_id,
        source_repo: sourceRepo,
        target_repo: repository.id,
        initial_portability_score: aggregate.portability_score,
        decision_status: aggregate.portability_score >= 0.7 ? 'recommended' : 'monitor',
        evidence_count: aggregate.repo_count
      });
    }
  }

  return recommendations.sort(
    (left, right) =>
      right.initial_portability_score - left.initial_portability_score ||
      left.pattern.localeCompare(right.pattern) ||
      left.target_repo.localeCompare(right.target_repo)
  );
};

const classifyOutcome = (portabilityScore: number): PortabilityOutcomeRecord['observed_outcome'] => {
  if (portabilityScore >= 0.8) {
    return 'successful';
  }
  if (portabilityScore >= 0.6) {
    return 'inconclusive';
  }
  return 'unsuccessful';
};

const classifyAdoption = (portabilityScore: number): PortabilityOutcomeRecord['adoption_status'] => {
  if (portabilityScore >= 0.75) {
    return 'adopted';
  }
  if (portabilityScore >= 0.6) {
    return 'accepted';
  }
  return 'reviewed';
};

const deriveOutcomesFromArtifact = (
  artifact: PortabilityOutcomesArtifact,
  recommendations: PortabilityRecommendationRecord[]
): PortabilityOutcomeRecord[] => {
  const recommendationMap = new Map(recommendations.map((entry) => [`${entry.pattern}::${entry.source_repo}::${entry.target_repo}`, entry]));

  return artifact.outcomes.map((outcome) => {
    const recommendation = recommendationMap.get(`${outcome.pattern_id}::${outcome.source_repo}::${outcome.target_repo}`);

    return {
      recommendation_id: outcome.recommendation_id,
      pattern: outcome.pattern_id,
      source_repo: outcome.source_repo,
      target_repo: outcome.target_repo,
      initial_portability_score: recommendation?.initial_portability_score ?? 0,
      decision_status: outcome.decision_status,
      ...(outcome.decision_reason ? { decision_reason: outcome.decision_reason } : {}),
      ...(outcome.adoption_status ? { adoption_status: outcome.adoption_status } : {}),
      ...(outcome.observed_outcome ? { observed_outcome: outcome.observed_outcome } : {}),
      ...(typeof outcome.outcome_confidence === 'number' ? { outcome_confidence: outcome.outcome_confidence } : {}),
      timestamp: outcome.timestamp,
      sample_size: recommendation?.evidence_count ?? 0
    };
  });
};

const deriveOutcomes = (cwd: string, recommendations: PortabilityRecommendationRecord[]): PortabilityOutcomeRecord[] => {
  const recorded = readPortabilityOutcomesArtifact(cwd) as PortabilityOutcomesArtifact;
  if (recorded.outcomes.length > 0) {
    return deriveOutcomesFromArtifact(recorded, recommendations);
  }

  return recommendations.map((recommendation, idx) => ({
    recommendation_id: `${recommendation.pattern}:${recommendation.source_repo}:${recommendation.target_repo}:${idx}`,
    pattern: recommendation.pattern,
    source_repo: recommendation.source_repo,
    target_repo: recommendation.target_repo,
    initial_portability_score: recommendation.initial_portability_score,
    decision_status: 'proposed',
    adoption_status: classifyAdoption(recommendation.initial_portability_score),
    observed_outcome: classifyOutcome(recommendation.initial_portability_score),
    outcome_confidence: recommendation.initial_portability_score,
    timestamp: '1970-01-01T00:00:00.000Z',
    sample_size: recommendation.evidence_count
  }));
};

const deriveRecalibration = (artifact: CrossRepoPatternsArtifact, outcomes: PortabilityOutcomeRecord[]): PortabilityRecalibrationRecord[] => {
  if (Array.isArray(artifact.portability_recalibration)) {
    return [...artifact.portability_recalibration];
  }

  const aggregateByPattern = new Map(artifact.aggregates.map((entry) => [entry.pattern_id, entry]));

  return outcomes.map((outcome) => {
    const aggregate = aggregateByPattern.get(outcome.pattern);
    const outcomeMultiplier =
      outcome.observed_outcome === 'successful' ? 1 : outcome.observed_outcome === 'inconclusive' ? 0.92 : 0.8;
    const consistency = aggregate?.outcome_consistency ?? 0.5;
    const adjusted = clamp(outcome.initial_portability_score * 0.65 + consistency * 0.35 * outcomeMultiplier);

    return {
      pattern: outcome.pattern,
      source_repo: outcome.source_repo,
      target_repo: outcome.target_repo,
      initial_portability_score: outcome.initial_portability_score,
      recalibrated_confidence: adjusted,
      evidence_count: aggregate?.repo_count ?? outcome.sample_size,
      sample_size: outcome.sample_size
    };
  });
};

export const parsePortabilityView = (args: string[]): PortabilityView => {
  const rawView = args.find((arg) => arg.startsWith('--view='))?.slice('--view='.length) ?? (() => {
    const index = args.findIndex((arg) => arg === '--view');
    return index >= 0 ? args[index + 1] : undefined;
  })();

  if (!rawView || rawView === 'overview') {
    return 'overview';
  }

  if (rawView === 'recommendations' || rawView === 'outcomes' || rawView === 'recalibration' || rawView === 'transfer-plans' || rawView === 'readiness' || rawView === 'blocked-transfers') {
    return rawView;
  }

  throw new Error('playbook knowledge portability: invalid --view value "' + rawView + '"; expected overview, recommendations, outcomes, recalibration, transfer-plans, readiness, or blocked-transfers');
};

export const runKnowledgePortability = (
  cwd: string,
  view: PortabilityView = 'overview'
):
  | { schemaVersion: '1.0'; command: 'knowledge-portability'; portability: PortabilityRecord[] }
  | { schemaVersion: '1.0'; command: 'knowledge-portability-recommendations'; recommendations: PortabilityRecommendationRecord[] }
  | { schemaVersion: '1.0'; command: 'knowledge-portability-outcomes'; outcomes: PortabilityOutcomeRecord[] }
  | { schemaVersion: '1.0'; command: 'knowledge-portability-recalibration'; recalibration: PortabilityRecalibrationRecord[] }
  | { schemaVersion: '1.0'; command: 'knowledge-portability-transfer-plans'; transfer_plans: TransferPlanRecord[] }
  | { schemaVersion: '1.0'; command: 'knowledge-portability-readiness'; readiness: TransferReadinessRecord[] }
  | { schemaVersion: '1.0'; command: 'knowledge-portability-blocked-transfers'; blocked_transfers: TransferReadinessRecord[] } => {
  if (view === 'transfer-plans') {
    return {
      schemaVersion: '1.0',
      command: 'knowledge-portability-transfer-plans',
      transfer_plans: readTransferPlansArtifact(cwd).plans
    };
  }

  if (view === 'readiness') {
    return {
      schemaVersion: '1.0',
      command: 'knowledge-portability-readiness',
      readiness: readTransferReadinessArtifact(cwd).assessments
    };
  }

  if (view === 'blocked-transfers') {
    return {
      schemaVersion: '1.0',
      command: 'knowledge-portability-blocked-transfers',
      blocked_transfers: readTransferReadinessArtifact(cwd).assessments.filter((entry) => entry.blockers.length > 0 || entry.recommendation === 'blocked')
    };
  }

  const artifact = readCrossRepoPatternsArtifact(cwd) as CrossRepoPatternsArtifact;

  if (view === 'overview') {
    return {
      schemaVersion: '1.0',
      command: 'knowledge-portability',
      portability: derivePortabilityRecords(artifact)
    };
  }

  const recommendations = deriveRecommendations(artifact);
  if (view === 'recommendations') {
    return {
      schemaVersion: '1.0',
      command: 'knowledge-portability-recommendations',
      recommendations
    };
  }

  const outcomes = deriveOutcomes(cwd, recommendations);
  if (view === 'outcomes') {
    return {
      schemaVersion: '1.0',
      command: 'knowledge-portability-outcomes',
      outcomes
    };
  }

  return {
    schemaVersion: '1.0',
    command: 'knowledge-portability-recalibration',
    recalibration: deriveRecalibration(artifact, outcomes)
  };
};
