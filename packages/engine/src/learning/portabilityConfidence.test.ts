import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generatePortabilityConfidenceArtifact, writePortabilityConfidenceArtifact } from './portabilityConfidence.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-portability-confidence-'));

const writeJson = (repoRoot: string, relativePath: string, value: unknown): void => {
  const targetPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(value, null, 2));
};

const writeBaseArtifacts = (repoRoot: string, overrides?: {
  confidenceScores?: number[];
  outcomes?: Array<{ family: string; source: string; target: string; outcome: 'success' | 'failure' }>;
}): void => {
  const confidenceScores = overrides?.confidenceScores ?? [0.7];
  const outcomes = overrides?.outcomes ?? [];

  writeJson(repoRoot, '.playbook/learning-compaction.json', {
    schemaVersion: '1.0',
    kind: 'learning-compaction',
    generatedAt: '2026-06-01T00:00:00.000Z',
    sourceArtifacts: {
      processTelemetry: { available: true, artifactPath: '.playbook/process-telemetry.json', recordCount: 1 },
      outcomeTelemetry: { available: true, artifactPath: '.playbook/outcome-telemetry.json', recordCount: 1 },
      memoryEvents: { available: true, artifactPath: '.playbook/memory/events', recordCount: 1 },
      memoryIndex: { available: true, artifactPath: '.playbook/memory/index.json', recordCount: 1 }
    },
    summary: {
      summary_id: 'summary-1',
      source_run_ids: ['run-1'],
      time_window: { start: '2026-05-01T00:00:00.000Z', end: '2026-05-31T00:00:00.000Z' },
      route_patterns: [],
      lane_patterns: [],
      validation_patterns: [],
      recurring_failures: [],
      recurring_successes: [],
      confidence: 0.75,
      open_questions: []
    }
  });

  writeJson(repoRoot, '.playbook/pattern-portability.json', {
    schemaVersion: '1.0',
    kind: 'pattern-portability',
    generatedAt: '2026-06-01T00:00:00.000Z',
    runs: confidenceScores.map((score, idx) => ({
      run_id: `portability-${idx + 1}`,
      generatedAt: '2026-06-01T00:00:00.000Z',
      source_repo: 'repo-a',
      target_repo: 'repo-b',
      evidence_runs: 3,
      scores: [
        {
          pattern_id: 'router_over_fragmented_knowledge_lifecycle',
          source_repo: 'repo-a',
          target_repo: 'repo-b',
          evidence_runs: 3,
          structural_similarity: 0.9,
          dependency_compatibility: 0.9,
          governance_risk: 0.2,
          confidence_score: score
        }
      ]
    }))
  });

  writeJson(repoRoot, '.playbook/cross-repo-patterns.json', {
    schemaVersion: '1.0',
    kind: 'cross-repo-patterns',
    generatedAt: '2026-06-01T00:00:00.000Z',
    repositories: [],
    aggregates: [
      {
        pattern_id: 'router_over_fragmented_knowledge_lifecycle',
        portability_score: 0.6
      }
    ]
  });

  writeJson(repoRoot, '.playbook/portability-outcomes.json', {
    generatedAt: '2026-06-02T00:00:00.000Z',
    outcomes: outcomes.map((outcome, idx) => ({
      source_pattern_family: outcome.family,
      source_repo: outcome.source,
      target_repo: outcome.target,
      outcome: outcome.outcome,
      id: `outcome-${idx}`
    }))
  });
};

describe('portability confidence recalibration', () => {
  it('strengthens confidence for repeated successful transfer evidence', () => {
    const repo = createRepo();
    writeBaseArtifacts(repo, {
      confidenceScores: [0.6, 0.62],
      outcomes: [
        { family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'success' },
        { family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'success' },
        { family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'success' },
        { family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'success' }
      ]
    });

    const artifact = generatePortabilityConfidenceArtifact(repo);
    const summary = artifact.summaries[0];
    expect(summary?.realized_success_rate).toBe(1);
    expect(summary?.recalibrated_confidence).toBeGreaterThan(summary?.prior_confidence_average ?? 0);
  });

  it('lowers confidence for repeated failed transfer evidence', () => {
    const repo = createRepo();
    writeBaseArtifacts(repo, {
      confidenceScores: [0.8],
      outcomes: [
        { family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'failure' },
        { family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'failure' },
        { family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'failure' },
        { family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'failure' }
      ]
    });

    const artifact = generatePortabilityConfidenceArtifact(repo);
    const summary = artifact.summaries[0];
    expect(summary?.realized_success_rate).toBe(0);
    expect(summary?.recalibrated_confidence).toBeLessThan(summary?.prior_confidence_average ?? 1);
  });

  it('keeps confidence conservative when evidence is sparse', () => {
    const repo = createRepo();
    writeBaseArtifacts(repo, {
      confidenceScores: [0.82],
      outcomes: [{ family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'success' }]
    });

    const artifact = generatePortabilityConfidenceArtifact(repo);
    const summary = artifact.summaries[0];
    expect(summary?.sample_size).toBe(1);
    expect(summary?.open_questions.some((question) => question.includes('Sparse transfer evidence'))).toBe(true);
    expect(Math.abs((summary?.recalibrated_confidence ?? 0) - (summary?.prior_confidence_average ?? 0))).toBeLessThan(0.08);
  });

  it('supports mixed evidence and deterministic output ordering', () => {
    const repo = createRepo();
    writeBaseArtifacts(repo, {
      confidenceScores: [0.7],
      outcomes: [
        { family: 'telemetry_learning', source: 'repo-z', target: 'repo-y', outcome: 'failure' },
        { family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'success' },
        { family: 'telemetry_learning', source: 'repo-z', target: 'repo-y', outcome: 'success' },
        { family: 'knowledge_lifecycle', source: 'repo-a', target: 'repo-b', outcome: 'failure' }
      ]
    });

    const artifact = generatePortabilityConfidenceArtifact(repo);
    expect(artifact.summaries.map((entry) => `${entry.source_pattern_family}:${entry.source_repo}:${entry.target_repo}`)).toEqual([
      'knowledge_lifecycle:repo-a:repo-b',
      'telemetry_learning:repo-z:repo-y'
    ]);

    const targetPath = writePortabilityConfidenceArtifact(repo, artifact);
    const persisted = JSON.parse(fs.readFileSync(targetPath, 'utf8')) as { summaries: Array<{ source_pattern_family: string }> };
    expect(persisted.summaries).toHaveLength(2);
    expect(persisted.summaries[0]?.source_pattern_family).toBe('knowledge_lifecycle');
  });
});
