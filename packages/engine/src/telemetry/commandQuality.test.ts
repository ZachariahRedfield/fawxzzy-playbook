import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readCommandQualityArtifact,
  recordCommandQualityTelemetry,
  summarizeCommandQuality
} from './commandQuality.js';

describe('commandQuality telemetry', () => {
  it('records deterministic command-quality signals', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-command-quality-'));

    recordCommandQualityTelemetry(repo, {
      commandName: 'verify',
      runId: 'run-1',
      inputsSummary: 'policy-mode=false',
      artifactsRead: ['.playbook/plan.json'],
      artifactsWritten: ['.playbook/verify-report.json'],
      successStatus: 'success',
      durationMs: 43,
      warningsCount: 1,
      openQuestionsCount: 0,
      confidenceScore: 0.9,
      downstreamArtifactsProduced: ['.playbook/verify-report.json'],
      recordedAt: '2026-03-16T00:00:00.000Z'
    });

    const artifact = readCommandQualityArtifact(repo);
    expect(artifact.kind).toBe('command-quality');
    expect(artifact.records).toHaveLength(1);
    expect(artifact.records[0]).toMatchObject({
      command_name: 'verify',
      run_id: 'run-1',
      success_status: 'success',
      duration_ms: 43
    });
  });

  it('summarizes partial-failure behavior deterministically', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-command-quality-partial-'));

    recordCommandQualityTelemetry(repo, {
      commandName: 'execute',
      runId: 'run-2',
      inputsSummary: 'lanes=2',
      successStatus: 'partial',
      durationMs: 120,
      warningsCount: 2,
      openQuestionsCount: 1,
      confidenceScore: 0.6,
      recordedAt: '2026-03-16T00:00:01.000Z'
    });

    const summary = summarizeCommandQuality(readCommandQualityArtifact(repo));
    expect(summary.total_records).toBe(1);
    expect(summary.by_command.execute?.partial_count).toBe(1);
    expect(summary.by_command.execute?.success_count).toBe(0);
    expect(summary.by_command.execute?.open_questions_total).toBe(1);
  });
});
