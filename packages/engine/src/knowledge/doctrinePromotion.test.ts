import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateDoctrinePromotionArtifact, writeDoctrinePromotionArtifacts } from './doctrinePromotion.js';
import type { ImprovementCandidatesArtifact } from '../improvement/candidateEngine.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-doctrine-promotion-'));

const seedLearningState = (repo: string, confidence = 0.9): void => {
  const learningPath = path.join(repo, '.playbook', 'learning-state.json');
  fs.mkdirSync(path.dirname(learningPath), { recursive: true });
  fs.writeFileSync(
    learningPath,
    JSON.stringify({
      schemaVersion: '1.0',
      kind: 'learning-state-snapshot',
      generatedAt: '2026-01-01T00:00:00.000Z',
      proposalOnly: true,
      sourceArtifacts: {
        outcomeTelemetry: { available: true, recordCount: 1, artifactPath: '.playbook/outcome-telemetry.json' },
        processTelemetry: { available: true, recordCount: 1, artifactPath: '.playbook/process-telemetry.json' },
        taskExecutionProfile: { available: true, recordCount: 1, artifactPath: '.playbook/task-execution-profile.json' }
      },
      metrics: {
        sample_size: 10,
        first_pass_yield: 0.9,
        retry_pressure: {},
        validation_load_ratio: 0.2,
        route_efficiency_score: { docs_only: 0.9 },
        smallest_sufficient_route_score: 0.8,
        parallel_safety_realized: 0.9,
        router_fit_score: 0.9,
        reasoning_scope_efficiency: 0.8,
        validation_cost_pressure: 0.2,
        pattern_family_effectiveness_score: { docs_only: 0.9 },
        portability_confidence: 0.8
      },
      confidenceSummary: {
        sample_size_score: 0.8,
        coverage_score: 0.8,
        evidence_completeness_score: 0.8,
        overall_confidence: confidence,
        open_questions: []
      }
    }, null, 2)
  );
};

const seedEvents = (repo: string, ids: string[]): void => {
  const eventsDir = path.join(repo, '.playbook', 'memory', 'events');
  fs.mkdirSync(eventsDir, { recursive: true });
  ids.forEach((id, index) => {
    fs.writeFileSync(path.join(eventsDir, `${id}.json`), JSON.stringify({
      schemaVersion: '1.0',
      event_type: 'route_decision',
      event_id: id,
      timestamp: `2026-01-0${index + 1}T00:00:00.000Z`,
      run_id: `run-${index < 2 ? 1 : 2}`,
      related_artifacts: [{ path: `.playbook/runs/${id}.json` }],
      payload: { task_family: 'docs_only', route_id: 'docs_default', summary: 'route recommendation stabilized' }
    }, null, 2));
  });
};

const baseImprovementArtifact = (): ImprovementCandidatesArtifact => ({
  schemaVersion: '1.0',
  kind: 'improvement-candidates',
  generatedAt: '2026-01-02T00:00:00.000Z',
  thresholds: { minimum_recurrence: 3, minimum_confidence: 0.6 },
  sourceArtifacts: {
    memoryEventsPath: '.playbook/memory/events',
    learningStatePath: '.playbook/learning-state.json',
    memoryEventCount: 3,
    learningStateAvailable: true
  },
  summary: { AUTO_SAFE: 0, CONVERSATIONAL: 1, GOVERNANCE: 0, total: 1 },
  candidates: [
    {
      candidate_id: 'routing_docs_overvalidation',
      category: 'routing',
      observation: 'docs route repeatedly over-validates',
      recurrence_count: 3,
      confidence_score: 0.84,
      suggested_action: 'use docs_only route by default',
      gating_tier: 'CONVERSATIONAL',
      improvement_tier: 'conversation',
      required_review: true,
      blocking_reasons: [],
      evidence: { event_ids: ['event-1', 'event-2', 'event-3'] },
      evidence_count: 3,
      supporting_runs: 2
    }
  ],
  rejected_candidates: []
});

describe('doctrine promotion pipeline', () => {
  it('creates promotion candidate from improvement and memory evidence', () => {
    const repo = createRepo();
    seedLearningState(repo, 0.9);
    seedEvents(repo, ['event-1', 'event-2', 'event-3']);

    const artifact = generateDoctrinePromotionArtifact(repo, baseImprovementArtifact());
    expect(artifact.candidates).toHaveLength(1);
    expect(artifact.candidates[0]?.lifecycle_stage).toBe('compacted');
    expect(artifact.candidates[0]?.source_evidence.length).toBeGreaterThan(0);
    expect(artifact.candidates[0]?.related_runs).toEqual(['run-1', 'run-2']);

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('transitions compacted to promoted when previous compacted record exists', () => {
    const repo = createRepo();
    seedLearningState(repo, 0.9);
    seedEvents(repo, ['event-1', 'event-2', 'event-3']);
    fs.writeFileSync(
      path.join(repo, '.playbook', 'knowledge-promotions.json'),
      JSON.stringify({ candidates: [{ candidate_id: 'routing_docs_overvalidation', lifecycle_stage: 'compacted' }] }, null, 2)
    );

    const artifact = generateDoctrinePromotionArtifact(repo, baseImprovementArtifact());
    expect(artifact.candidates[0]?.lifecycle_stage).toBe('promoted');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('rejects with insufficient evidence', () => {
    const repo = createRepo();
    seedLearningState(repo, 0.9);
    seedEvents(repo, ['event-1']);
    const improvement = baseImprovementArtifact();
    improvement.candidates[0] = {
      ...improvement.candidates[0],
      confidence_score: 0.4,
      evidence_count: 1,
      supporting_runs: 1,
      evidence: { event_ids: ['event-1'] }
    };

    const artifact = generateDoctrinePromotionArtifact(repo, improvement);
    expect(artifact.rejected.length).toBeGreaterThan(0);
    expect(artifact.candidates[0]?.lifecycle_stage).toBe('candidate');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('proposes retirement when previously promoted confidence degrades', () => {
    const repo = createRepo();
    seedLearningState(repo, 0.9);
    seedEvents(repo, ['event-1', 'event-2', 'event-3']);
    fs.writeFileSync(
      path.join(repo, '.playbook', 'knowledge-promotions.json'),
      JSON.stringify({ candidates: [{ candidate_id: 'routing_docs_overvalidation', lifecycle_stage: 'promoted' }] }, null, 2)
    );

    const improvement = baseImprovementArtifact();
    improvement.candidates[0] = { ...improvement.candidates[0], confidence_score: 0.4 };
    const artifact = generateDoctrinePromotionArtifact(repo, improvement);
    expect(artifact.candidates[0]?.lifecycle_stage).toBe('retired');
    expect(artifact.candidates[0]?.retirement_rationale).toBeDefined();

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('enforces governance-gated promotion via low learning confidence rejection', () => {
    const repo = createRepo();
    seedLearningState(repo, 0.4);
    seedEvents(repo, ['event-1', 'event-2', 'event-3']);

    const artifact = generateDoctrinePromotionArtifact(repo, baseImprovementArtifact());
    expect(artifact.rejected[0]?.rejection_reasons).toContain('insufficient_learning_confidence');

    writeDoctrinePromotionArtifacts(repo, artifact);
    expect(fs.existsSync(path.join(repo, '.playbook', 'knowledge-candidates.json'))).toBe(true);
    expect(fs.existsSync(path.join(repo, '.playbook', 'knowledge-promotions.json'))).toBe(true);

    fs.rmSync(repo, { recursive: true, force: true });
  });
});
