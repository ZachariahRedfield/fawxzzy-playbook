import fs from 'node:fs';
import path from 'node:path';
import type { DoctrineGatingTier, DoctrineLifecycleStage, DoctrinePromotionCandidate } from '@zachariahredfield/playbook-core';
import type { ImprovementCandidate, ImprovementCandidatesArtifact } from '../improvement/candidateEngine.js';
import type { LearningStateSnapshotArtifact } from '../telemetry/learningState.js';
import type { RepositoryEvent } from '../memory/events.js';

export const KNOWLEDGE_CANDIDATES_RELATIVE_PATH = '.playbook/knowledge-candidates.json' as const;
export const KNOWLEDGE_PROMOTIONS_RELATIVE_PATH = '.playbook/knowledge-promotions.json' as const;

export type DoctrinePromotionArtifact = {
  schemaVersion: '1.0';
  kind: 'knowledge-doctrine-promotions';
  generatedAt: string;
  sourceArtifacts: {
    learningStatePath: string;
    improvementCandidatesPath: string;
    repositoryEventsPath: string;
  };
  summary: Record<DoctrineLifecycleStage, number>;
  candidates: DoctrinePromotionCandidate[];
  rejected: Array<{
    candidate_id: string;
    pattern_family: string;
    confidence_score: number;
    gating_tier: DoctrineGatingTier;
    rejection_reasons: string[];
  }>;
};

type PreviousPromotionArtifact = { candidates?: DoctrinePromotionCandidate[] };

type NormalizedEvent = {
  event_id: string;
  run_id: string;
  related_artifacts: string[];
  summary: string;
};

const deterministicStringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const round4 = (value: number): number => Number(value.toFixed(4));

const readJsonFileIfExists = <T>(filePath: string): T | undefined => {
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
};

const readRepositoryEvents = (repoRoot: string): RepositoryEvent[] => {
  const eventsDir = path.join(repoRoot, '.playbook', 'memory', 'events');
  if (!fs.existsSync(eventsDir)) return [];

  return fs
    .readdirSync(eventsDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => JSON.parse(fs.readFileSync(path.join(eventsDir, entry), 'utf8')) as RepositoryEvent)
    .filter((event) => typeof event?.event_id === 'string' && typeof event?.timestamp === 'string');
};

const normalizeMemoryEvidence = (events: RepositoryEvent[]): NormalizedEvent[] =>
  events.map((event) => {
    const payload = event.payload && typeof event.payload === 'object' ? (event.payload as Record<string, unknown>) : {};
    const summary = [event.event_type, payload.summary, payload.task_family, payload.route_id]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(':');
    return {
      event_id: event.event_id,
      run_id: event.run_id ?? event.timestamp.slice(0, 10),
      related_artifacts: (event.related_artifacts ?? [])
        .map((artifact) => artifact.path)
        .filter((artifactPath): artifactPath is string => typeof artifactPath === 'string' && artifactPath.length > 0),
      summary
    };
  });

const toPatternFamily = (candidate: ImprovementCandidate): string =>
  candidate.category === 'routing' ? 'router-recommendations' : `improvement-${candidate.category}`;

const hasSufficientEvidence = (candidate: ImprovementCandidate, learning: LearningStateSnapshotArtifact | undefined): string[] => {
  const reasons: string[] = [];
  if (candidate.evidence_count < 3) reasons.push('insufficient_evidence_count');
  if (candidate.supporting_runs < 1) reasons.push('insufficient_supporting_runs');
  if (candidate.confidence_score < 0.6) reasons.push('insufficient_confidence');
  if ((learning?.confidenceSummary.overall_confidence ?? 0) < 0.55) reasons.push('insufficient_learning_confidence');
  return reasons;
};

const nextLifecycleStage = (
  candidate: ImprovementCandidate,
  rejectionReasons: string[],
  previous: DoctrinePromotionCandidate | undefined
): DoctrineLifecycleStage => {
  if (candidate.confidence_score < 0.45 && candidate.evidence_count >= 3) {
    return 'retired';
  }

  if (rejectionReasons.length > 0) {
    return previous?.lifecycle_stage === 'promoted' ? 'retired' : 'candidate';
  }

  if (previous?.lifecycle_stage === 'promoted') {
    return 'promoted';
  }

  if (previous?.lifecycle_stage === 'compacted') {
    return 'promoted';
  }

  return 'compacted';
};

const buildPromotionRationale = (candidate: ImprovementCandidate, lifecycleStage: DoctrineLifecycleStage): string => {
  if (lifecycleStage === 'promoted') {
    return `Promoted from compacted evidence with deterministic support (${candidate.evidence_count} events, confidence ${candidate.confidence_score}).`;
  }

  if (lifecycleStage === 'compacted') {
    return `Compacted recommendation from improvement proposals and normalized memory evidence (${candidate.evidence_count} events).`;
  }

  if (lifecycleStage === 'retired') {
    return 'Retained for lineage only; no automatic doctrine mutation performed.';
  }

  return 'Candidate retained pending additional repeated evidence and governance review.';
};

export const generateDoctrinePromotionArtifact = (
  repoRoot: string,
  improvementArtifact: ImprovementCandidatesArtifact
): DoctrinePromotionArtifact => {
  const learningPath = path.join(repoRoot, '.playbook', 'learning-state.json');
  const promotionsPath = path.join(repoRoot, KNOWLEDGE_PROMOTIONS_RELATIVE_PATH);
  const learning = readJsonFileIfExists<LearningStateSnapshotArtifact>(learningPath);
  const events = normalizeMemoryEvidence(readRepositoryEvents(repoRoot));
  const previous = readJsonFileIfExists<PreviousPromotionArtifact>(promotionsPath);
  const previousById = new Map((previous?.candidates ?? []).map((entry) => [entry.candidate_id, entry]));

  const rejected: DoctrinePromotionArtifact['rejected'] = [];
  const candidates = improvementArtifact.candidates
    .map((candidate) => {
      const relatedEvents = events.filter((event) => candidate.evidence.event_ids.includes(event.event_id));
      const sourceEvidence = [...new Set(relatedEvents.map((event) => event.summary).filter((value) => value.length > 0))].sort((a, b) =>
        a.localeCompare(b)
      );
      const relatedRuns = [...new Set(relatedEvents.map((event) => event.run_id))].sort((a, b) => a.localeCompare(b));
      const relatedArtifacts = [...new Set(relatedEvents.flatMap((event) => event.related_artifacts))].sort((a, b) => a.localeCompare(b));
      const rejectionReasons = hasSufficientEvidence(candidate, learning);
      const previousEntry = previousById.get(candidate.candidate_id);
      const lifecycleStage = nextLifecycleStage(candidate, rejectionReasons, previousEntry);

      if (rejectionReasons.length > 0 && lifecycleStage === 'candidate') {
        rejected.push({
          candidate_id: candidate.candidate_id,
          pattern_family: toPatternFamily(candidate),
          confidence_score: round4(candidate.confidence_score),
          gating_tier: candidate.gating_tier,
          rejection_reasons: rejectionReasons
        });
      }

      return {
        candidate_id: candidate.candidate_id,
        source_evidence: sourceEvidence,
        related_runs: relatedRuns,
        related_artifacts: relatedArtifacts,
        pattern_family: toPatternFamily(candidate),
        confidence_score: round4(candidate.confidence_score),
        lifecycle_stage: lifecycleStage,
        promotion_rationale: buildPromotionRationale(candidate, lifecycleStage),
        retirement_rationale: lifecycleStage === 'retired' ? 'Confidence degraded or governance gate not satisfied for durable doctrine.' : undefined,
        gating_tier: candidate.gating_tier
      } satisfies DoctrinePromotionCandidate;
    })
    .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));

  const summary: Record<DoctrineLifecycleStage, number> = {
    candidate: 0,
    compacted: 0,
    promoted: 0,
    retired: 0
  };

  for (const candidate of candidates) {
    summary[candidate.lifecycle_stage] += 1;
  }

  return {
    schemaVersion: '1.0',
    kind: 'knowledge-doctrine-promotions',
    generatedAt: new Date().toISOString(),
    sourceArtifacts: {
      learningStatePath: '.playbook/learning-state.json',
      improvementCandidatesPath: '.playbook/improvement-candidates.json',
      repositoryEventsPath: '.playbook/memory/events'
    },
    summary,
    candidates,
    rejected: rejected.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))
  };
};

export const writeDoctrinePromotionArtifacts = (repoRoot: string, artifact: DoctrinePromotionArtifact): void => {
  const candidatesPath = path.join(repoRoot, KNOWLEDGE_CANDIDATES_RELATIVE_PATH);
  const promotionsPath = path.join(repoRoot, KNOWLEDGE_PROMOTIONS_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(candidatesPath), { recursive: true });
  fs.writeFileSync(candidatesPath, deterministicStringify({
    schemaVersion: artifact.schemaVersion,
    kind: 'knowledge-doctrine-candidates',
    generatedAt: artifact.generatedAt,
    candidates: artifact.candidates.filter((candidate) => candidate.lifecycle_stage !== 'promoted'),
    rejected: artifact.rejected
  }));
  fs.writeFileSync(promotionsPath, deterministicStringify(artifact));
};
