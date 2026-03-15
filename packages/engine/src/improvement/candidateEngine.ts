import fs from 'node:fs';
import path from 'node:path';
import type { LearningStateSnapshotArtifact } from '../telemetry/learningState.js';
import type {
  ImprovementCandidateEvent,
  LaneTransitionEvent,
  RepositoryEvent,
  RouteDecisionEvent,
  WorkerAssignmentEvent
} from '../memory/events.js';

export const IMPROVEMENT_CANDIDATES_SCHEMA_VERSION = '1.0' as const;
export const IMPROVEMENT_CANDIDATES_RELATIVE_PATH = '.playbook/improvement-candidates.json' as const;

export type ImprovementCandidateCategory =
  | 'routing'
  | 'orchestration'
  | 'worker_prompts'
  | 'validation_efficiency'
  | 'ontology';

export type ImprovementTier = 'AUTO-SAFE' | 'CONVERSATIONAL' | 'GOVERNANCE';

export type ImprovementCandidate = {
  candidate_id: string;
  category: ImprovementCandidateCategory;
  observation: string;
  recurrence_count: number;
  confidence: number;
  suggested_action: string;
  improvement_tier: ImprovementTier;
  evidence: {
    event_ids: string[];
  };
};

export type ImprovementCandidatesArtifact = {
  schemaVersion: typeof IMPROVEMENT_CANDIDATES_SCHEMA_VERSION;
  kind: 'improvement-candidates';
  generatedAt: string;
  thresholds: {
    minimum_recurrence: number;
    minimum_confidence: number;
  };
  sourceArtifacts: {
    memoryEventsPath: string;
    learningStatePath: string;
    memoryEventCount: number;
    learningStateAvailable: boolean;
  };
  summary: {
    AUTO_SAFE: number;
    CONVERSATIONAL: number;
    GOVERNANCE: number;
    total: number;
  };
  candidates: ImprovementCandidate[];
};

const MINIMUM_RECURRENCE = 3;
const MINIMUM_CONFIDENCE = 0.6;

const round4 = (value: number): number => Number(value.toFixed(4));
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const deterministicStringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const readJsonFileIfExists = <T>(filePath: string): T | undefined => {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
};

const readRepositoryEvents = (repoRoot: string): RepositoryEvent[] => {
  const eventsDir = path.join(repoRoot, '.playbook', 'memory', 'events');
  if (!fs.existsSync(eventsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(eventsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const events: RepositoryEvent[] = [];

  for (const fileName of files) {
    const eventPath = path.join(eventsDir, fileName);
    try {
      const parsed = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as RepositoryEvent;
      if (parsed && typeof parsed.event_type === 'string' && typeof parsed.event_id === 'string') {
        events.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return events;
};

const buildTier = (category: ImprovementCandidateCategory): ImprovementTier => {
  if (category === 'ontology') {
    return 'GOVERNANCE';
  }

  if (category === 'orchestration' || category === 'worker_prompts') {
    return 'CONVERSATIONAL';
  }

  return 'AUTO-SAFE';
};

const buildConfidence = (recurrenceCount: number, signalScore: number, learningConfidence: number): number =>
  round4(clamp01(Math.min(1, recurrenceCount / 10) * 0.45 + signalScore * 0.4 + learningConfidence * 0.15));

const emitCandidate = (input: {
  candidateId: string;
  category: ImprovementCandidateCategory;
  observation: string;
  recurrenceCount: number;
  signalScore: number;
  learningConfidence: number;
  suggestedAction: string;
  eventIds: string[];
}): ImprovementCandidate | null => {
  const confidence = buildConfidence(input.recurrenceCount, input.signalScore, input.learningConfidence);
  if (input.recurrenceCount < MINIMUM_RECURRENCE || confidence < MINIMUM_CONFIDENCE) {
    return null;
  }

  return {
    candidate_id: input.candidateId,
    category: input.category,
    observation: input.observation,
    recurrence_count: input.recurrenceCount,
    confidence,
    suggested_action: input.suggestedAction,
    improvement_tier: buildTier(input.category),
    evidence: {
      event_ids: [...input.eventIds].sort((left, right) => left.localeCompare(right))
    }
  };
};

const generateRoutingCandidates = (
  events: RouteDecisionEvent[],
  learning: LearningStateSnapshotArtifact | undefined
): ImprovementCandidate[] => {
  const grouped = new Map<string, RouteDecisionEvent[]>();
  for (const event of events) {
    const key = `${event.task_family}::${event.route_id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  const learningConfidence = learning?.confidenceSummary.overall_confidence ?? 0;
  const validationPressure = learning?.metrics.validation_cost_pressure ?? 0;

  const candidates: ImprovementCandidate[] = [];
  for (const [key, group] of [...grouped.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    const [taskFamily, routeId] = key.split('::');
    const averageConfidence = group.reduce((sum, event) => sum + event.confidence, 0) / Math.max(1, group.length);
    const signalScore = clamp01(averageConfidence * 0.65 + validationPressure * 0.35);

    const isDocsValidationCandidate = taskFamily === 'docs_only' && validationPressure >= 0.6;
    const observation = isDocsValidationCandidate
      ? 'docs_only tasks over-validated'
      : `Recurring route selection for ${taskFamily} tasks via ${routeId}.`;
    const suggestedAction = isDocsValidationCandidate
      ? 'reduce optional validation'
      : `codify ${routeId} as preferred baseline route for ${taskFamily} tasks`;

    const candidate = emitCandidate({
      candidateId: isDocsValidationCandidate
        ? 'routing_docs_overvalidation'
        : `routing_${taskFamily}_${routeId}`.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
      category: 'routing',
      observation,
      recurrenceCount: group.length,
      signalScore,
      learningConfidence,
      suggestedAction,
      eventIds: group.map((event) => event.event_id)
    });

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
};

const generateOrchestrationCandidates = (
  events: LaneTransitionEvent[],
  learning: LearningStateSnapshotArtifact | undefined
): ImprovementCandidate[] => {
  const blocked = events.filter((event) => event.to_state === 'blocked');
  const grouped = new Map<string, LaneTransitionEvent[]>();
  for (const event of blocked) {
    const reason = event.reason?.trim() || 'unknown';
    grouped.set(reason, [...(grouped.get(reason) ?? []), event]);
  }

  const learningConfidence = learning?.confidenceSummary.overall_confidence ?? 0;
  return [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([reason, group]) =>
      emitCandidate({
        candidateId: `orchestration_blocked_${reason}`.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
        category: 'orchestration',
        observation: `Lane transitions repeatedly block due to ${reason}.`,
        recurrenceCount: group.length,
        signalScore: clamp01(0.7 + (learning?.metrics.parallel_safety_realized ?? 0) * 0.15),
        learningConfidence,
        suggestedAction: `add deterministic unblock playbook for ${reason}`,
        eventIds: group.map((event) => event.event_id)
      })
    )
    .filter((candidate): candidate is ImprovementCandidate => Boolean(candidate));
};

const generateWorkerPromptCandidates = (
  events: WorkerAssignmentEvent[],
  learning: LearningStateSnapshotArtifact | undefined
): ImprovementCandidate[] => {
  const degraded = events.filter((event) => event.assignment_status === 'blocked' || event.assignment_status === 'skipped');
  const grouped = new Map<string, WorkerAssignmentEvent[]>();
  for (const event of degraded) {
    grouped.set(event.worker_id, [...(grouped.get(event.worker_id) ?? []), event]);
  }

  const learningConfidence = learning?.confidenceSummary.overall_confidence ?? 0;

  return [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([workerId, group]) =>
      emitCandidate({
        candidateId: `worker_prompt_${workerId}`.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
        category: 'worker_prompts',
        observation: `Worker ${workerId} assignments repeatedly degrade (blocked/skipped).`,
        recurrenceCount: group.length,
        signalScore: clamp01(0.68 + (1 - (learning?.metrics.reasoning_scope_efficiency ?? 0)) * 0.2),
        learningConfidence,
        suggestedAction: `tighten ${workerId} prompt contract with explicit acceptance checklist`,
        eventIds: group.map((event) => event.event_id)
      })
    )
    .filter((candidate): candidate is ImprovementCandidate => Boolean(candidate));
};

const generateValidationEfficiencyCandidates = (
  events: RepositoryEvent[],
  learning: LearningStateSnapshotArtifact | undefined
): ImprovementCandidate[] => {
  const learningConfidence = learning?.confidenceSummary.overall_confidence ?? 0;
  const validationPressure = learning?.metrics.validation_cost_pressure ?? 0;
  const overValidationRoutes = events.filter(
    (event): event is RouteDecisionEvent => event.event_type === 'route_decision' && event.task_family === 'docs_only'
  );

  const candidate = emitCandidate({
    candidateId: 'validation_efficiency_docs_optional_checks',
    category: 'validation_efficiency',
    observation: 'Optional validations dominate docs-focused tasks and increase validation cost pressure.',
    recurrenceCount: overValidationRoutes.length,
    signalScore: clamp01(validationPressure),
    learningConfidence,
    suggestedAction: 'reduce optional validation for docs_only family unless risk signals are present',
    eventIds: overValidationRoutes.map((event) => event.event_id)
  });

  return candidate ? [candidate] : [];
};

const generateOntologyCandidates = (
  events: ImprovementCandidateEvent[],
  learning: LearningStateSnapshotArtifact | undefined
): ImprovementCandidate[] => {
  const ontologyRelated = events.filter((event) => {
    const source = event.source.toLowerCase();
    const summary = event.summary.toLowerCase();
    return source.includes('ontology') || summary.includes('ontology') || summary.includes('taxonomy');
  });

  const grouped = new Map<string, ImprovementCandidateEvent[]>();
  for (const event of ontologyRelated) {
    const key = event.summary.trim().toLowerCase();
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  const learningConfidence = learning?.confidenceSummary.overall_confidence ?? 0;
  return [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([summary, group]) => {
      const averageEventConfidence = group.reduce((sum, event) => sum + (event.confidence ?? 0.7), 0) / Math.max(1, group.length);
      return emitCandidate({
        candidateId: `ontology_${summary}`.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
        category: 'ontology',
        observation: `Ontology drift recurrence: ${summary}.`,
        recurrenceCount: group.length,
        signalScore: clamp01(averageEventConfidence),
        learningConfidence,
        suggestedAction: 'promote normalized ontology terms into governance dictionary and route prompts',
        eventIds: group.map((event) => event.event_id)
      });
    })
    .filter((candidate): candidate is ImprovementCandidate => Boolean(candidate));
};

export const generateImprovementCandidates = (repoRoot: string): ImprovementCandidatesArtifact => {
  const events = readRepositoryEvents(repoRoot);
  const learningStatePath = path.join(repoRoot, '.playbook', 'learning-state.json');
  const learning = readJsonFileIfExists<LearningStateSnapshotArtifact>(learningStatePath);

  const routeEvents = events.filter((event): event is RouteDecisionEvent => event.event_type === 'route_decision');
  const laneTransitionEvents = events.filter((event): event is LaneTransitionEvent => event.event_type === 'lane_transition');
  const workerAssignmentEvents = events.filter((event): event is WorkerAssignmentEvent => event.event_type === 'worker_assignment');
  const improvementEvents = events.filter((event): event is ImprovementCandidateEvent => event.event_type === 'improvement_candidate');

  const candidates = [
    ...generateRoutingCandidates(routeEvents, learning),
    ...generateOrchestrationCandidates(laneTransitionEvents, learning),
    ...generateWorkerPromptCandidates(workerAssignmentEvents, learning),
    ...generateValidationEfficiencyCandidates(events, learning),
    ...generateOntologyCandidates(improvementEvents, learning)
  ].sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return left.candidate_id.localeCompare(right.candidate_id);
  });

  const summary = {
    AUTO_SAFE: candidates.filter((candidate) => candidate.improvement_tier === 'AUTO-SAFE').length,
    CONVERSATIONAL: candidates.filter((candidate) => candidate.improvement_tier === 'CONVERSATIONAL').length,
    GOVERNANCE: candidates.filter((candidate) => candidate.improvement_tier === 'GOVERNANCE').length,
    total: candidates.length
  };

  return {
    schemaVersion: IMPROVEMENT_CANDIDATES_SCHEMA_VERSION,
    kind: 'improvement-candidates',
    generatedAt: new Date().toISOString(),
    thresholds: {
      minimum_recurrence: MINIMUM_RECURRENCE,
      minimum_confidence: MINIMUM_CONFIDENCE
    },
    sourceArtifacts: {
      memoryEventsPath: '.playbook/memory/events/*',
      learningStatePath: '.playbook/learning-state.json',
      memoryEventCount: events.length,
      learningStateAvailable: Boolean(learning)
    },
    summary,
    candidates
  };
};

export const writeImprovementCandidatesArtifact = (
  repoRoot: string,
  artifact: ImprovementCandidatesArtifact,
  artifactPath = IMPROVEMENT_CANDIDATES_RELATIVE_PATH
): string => {
  const resolvedPath = path.resolve(repoRoot, artifactPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, deterministicStringify(artifact), 'utf8');
  return resolvedPath;
};
