import path from 'node:path';
import {
  type CommandExecutionQualityRecord,
  type CommandExecutionSuccessStatus
} from '@zachariahredfield/playbook-core';
import { readJsonIfExists, writeDeterministicJsonAtomic } from '../learning/io.js';

export const COMMAND_QUALITY_SCHEMA_VERSION = '1.0' as const;
export const COMMAND_QUALITY_RELATIVE_PATH = '.playbook/telemetry/command-quality.json' as const;

export type CommandQualityArtifact = {
  schemaVersion: typeof COMMAND_QUALITY_SCHEMA_VERSION;
  kind: 'command-quality';
  generatedAt: string;
  records: CommandExecutionQualityRecord[];
};

export type RecordCommandExecutionQualityInput = {
  commandName: string;
  runId: string;
  inputsSummary: string;
  artifactsRead?: string[];
  artifactsWritten?: string[];
  successStatus: CommandExecutionSuccessStatus;
  durationMs: number;
  warningsCount?: number;
  openQuestionsCount?: number;
  confidenceScore?: number;
  downstreamArtifactsProduced?: string[];
  recordedAt?: string;
};

export type CommandQualitySummary = {
  total_records: number;
  by_command: Record<
    string,
    {
      total_runs: number;
      success_count: number;
      failure_count: number;
      partial_count: number;
      average_duration_ms: number;
      average_confidence_score: number;
      warnings_total: number;
      open_questions_total: number;
    }
  >;
};

const canonicalStrings = (values: string[] | undefined): string[] =>
  [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));

const boundedNumber = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const normalizeRecord = (input: RecordCommandExecutionQualityInput): CommandExecutionQualityRecord => ({
  command_name: input.commandName,
  run_id: input.runId,
  inputs_summary: input.inputsSummary.trim(),
  artifacts_read: canonicalStrings(input.artifactsRead),
  artifacts_written: canonicalStrings(input.artifactsWritten),
  success_status: input.successStatus,
  duration_ms: Math.max(0, Math.trunc(input.durationMs)),
  warnings_count: Math.max(0, Math.trunc(input.warningsCount ?? 0)),
  open_questions_count: Math.max(0, Math.trunc(input.openQuestionsCount ?? 0)),
  confidence_score: boundedNumber(input.confidenceScore ?? 0.5, 0, 1),
  downstream_artifacts_produced: canonicalStrings(input.downstreamArtifactsProduced),
  recorded_at: input.recordedAt ?? new Date().toISOString()
});

const emptyArtifact = (): CommandQualityArtifact => ({
  schemaVersion: COMMAND_QUALITY_SCHEMA_VERSION,
  kind: 'command-quality',
  generatedAt: new Date(0).toISOString(),
  records: []
});

export const readCommandQualityArtifact = (repoRoot: string): CommandQualityArtifact => {
  const artifactPath = path.join(repoRoot, COMMAND_QUALITY_RELATIVE_PATH);
  const parsed = readJsonIfExists<CommandQualityArtifact>(artifactPath);
  if (!parsed || parsed.schemaVersion !== COMMAND_QUALITY_SCHEMA_VERSION || parsed.kind !== 'command-quality' || !Array.isArray(parsed.records)) {
    return emptyArtifact();
  }

  return {
    schemaVersion: COMMAND_QUALITY_SCHEMA_VERSION,
    kind: 'command-quality',
    generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : new Date(0).toISOString(),
    records: parsed.records
      .filter((record) => record && typeof record === 'object')
      .map((record) => ({
        command_name: String(record.command_name ?? ''),
        run_id: String(record.run_id ?? ''),
        inputs_summary: String(record.inputs_summary ?? ''),
        artifacts_read: canonicalStrings(record.artifacts_read),
        artifacts_written: canonicalStrings(record.artifacts_written),
        success_status: (record.success_status === 'success' || record.success_status === 'failure' || record.success_status === 'partial'
          ? record.success_status
          : 'failure') as CommandExecutionSuccessStatus,
        duration_ms: Math.max(0, Math.trunc(Number(record.duration_ms ?? 0))),
        warnings_count: Math.max(0, Math.trunc(Number(record.warnings_count ?? 0))),
        open_questions_count: Math.max(0, Math.trunc(Number(record.open_questions_count ?? 0))),
        confidence_score: boundedNumber(Number(record.confidence_score ?? 0.5), 0, 1),
        downstream_artifacts_produced: canonicalStrings(record.downstream_artifacts_produced),
        recorded_at: typeof record.recorded_at === 'string' && record.recorded_at.length > 0 ? record.recorded_at : new Date(0).toISOString()
      }))
  };
};

export const writeCommandQualityArtifact = (repoRoot: string, artifact: CommandQualityArtifact): void => {
  const artifactPath = path.join(repoRoot, COMMAND_QUALITY_RELATIVE_PATH);
  writeDeterministicJsonAtomic(artifactPath, artifact);
};

export const recordCommandQualityTelemetry = (repoRoot: string, input: RecordCommandExecutionQualityInput): CommandExecutionQualityRecord => {
  const current = readCommandQualityArtifact(repoRoot);
  const record = normalizeRecord(input);
  const records = [...current.records, record].sort((left, right) => {
    const byTime = left.recorded_at.localeCompare(right.recorded_at);
    if (byTime !== 0) return byTime;
    const byRun = left.run_id.localeCompare(right.run_id);
    if (byRun !== 0) return byRun;
    return left.command_name.localeCompare(right.command_name);
  });

  writeCommandQualityArtifact(repoRoot, {
    schemaVersion: COMMAND_QUALITY_SCHEMA_VERSION,
    kind: 'command-quality',
    generatedAt: record.recorded_at,
    records
  });

  return record;
};

export const recordCommandQualityTelemetrySafe = (repoRoot: string, input: RecordCommandExecutionQualityInput): void => {
  try {
    recordCommandQualityTelemetry(repoRoot, input);
  } catch {
    // command-quality telemetry is best-effort and must not block command execution.
  }
};

export const summarizeCommandQuality = (artifact: CommandQualityArtifact): CommandQualitySummary => {
  const byCommand = new Map<string, {
    total_runs: number;
    success_count: number;
    failure_count: number;
    partial_count: number;
    duration_total: number;
    confidence_total: number;
    warnings_total: number;
    open_questions_total: number;
  }>();

  for (const record of artifact.records) {
    const slot = byCommand.get(record.command_name) ?? {
      total_runs: 0,
      success_count: 0,
      failure_count: 0,
      partial_count: 0,
      duration_total: 0,
      confidence_total: 0,
      warnings_total: 0,
      open_questions_total: 0
    };

    slot.total_runs += 1;
    if (record.success_status === 'success') slot.success_count += 1;
    if (record.success_status === 'failure') slot.failure_count += 1;
    if (record.success_status === 'partial') slot.partial_count += 1;
    slot.duration_total += record.duration_ms;
    slot.confidence_total += record.confidence_score;
    slot.warnings_total += record.warnings_count;
    slot.open_questions_total += record.open_questions_count;
    byCommand.set(record.command_name, slot);
  }

  return {
    total_records: artifact.records.length,
    by_command: Object.fromEntries(
      [...byCommand.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([command, slot]) => [
          command,
          {
            total_runs: slot.total_runs,
            success_count: slot.success_count,
            failure_count: slot.failure_count,
            partial_count: slot.partial_count,
            average_duration_ms: slot.total_runs === 0 ? 0 : Number((slot.duration_total / slot.total_runs).toFixed(3)),
            average_confidence_score: slot.total_runs === 0 ? 0 : Number((slot.confidence_total / slot.total_runs).toFixed(4)),
            warnings_total: slot.warnings_total,
            open_questions_total: slot.open_questions_total
          }
        ])
    )
  };
};
