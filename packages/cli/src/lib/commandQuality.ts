import * as engine from '@zachariahredfield/playbook-engine';

type CommandExecutionSuccessStatus = 'success' | 'failure' | 'partial';

export type CommandQualityRecorderInput = {
  cwd: string;
  commandName: 'verify' | 'route' | 'orchestrate' | 'execute' | 'telemetry' | 'improve';
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
};

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

export const recordCommandQualitySignal = (input: CommandQualityRecorderInput): void => {
  const artifactsWritten = unique([...(input.artifactsWritten ?? []), ...(input.downstreamArtifactsProduced ?? [])]);

  let recordTelemetrySafe: ((cwd: string, payload: unknown) => void) | undefined;
  try {
    recordTelemetrySafe = (engine as Record<string, unknown>).recordCommandQualityTelemetrySafe as
      | ((cwd: string, payload: unknown) => void)
      | undefined;
  } catch {
    recordTelemetrySafe = undefined;
  }

  recordTelemetrySafe?.(input.cwd, {
    commandName: input.commandName,
    runId: input.runId,
    inputsSummary: input.inputsSummary,
    artifactsRead: input.artifactsRead ?? [],
    artifactsWritten,
    successStatus: input.successStatus,
    durationMs: input.durationMs,
    warningsCount: input.warningsCount ?? 0,
    openQuestionsCount: input.openQuestionsCount ?? 0,
    confidenceScore: input.confidenceScore ?? 0.5,
    downstreamArtifactsProduced: input.downstreamArtifactsProduced ?? []
  });

  let safeRecordRepositoryEvent: ((callback: () => void) => void) | undefined;
  try {
    safeRecordRepositoryEvent = (engine as Record<string, unknown>).safeRecordRepositoryEvent as ((callback: () => void) => void) | undefined;
  } catch {
    safeRecordRepositoryEvent = undefined;
  }

  safeRecordRepositoryEvent?.(() => {
    let recordMemoryEvent: ((cwd: string, payload: unknown) => void) | undefined;
    try {
      recordMemoryEvent = (engine as Record<string, unknown>).recordCommandExecutionQuality as
        | ((cwd: string, payload: unknown) => void)
        | undefined;
    } catch {
      recordMemoryEvent = undefined;
    }

    recordMemoryEvent?.(input.cwd, {
      run_id: input.runId,
      command_name: input.commandName,
      success_status: input.successStatus,
      duration_ms: input.durationMs,
      warnings_count: input.warningsCount ?? 0,
      open_questions_count: input.openQuestionsCount ?? 0,
      confidence_score: input.confidenceScore ?? 0.5,
      related_artifacts: artifactsWritten.map((artifactPath) => ({ path: artifactPath, kind: 'command_quality' }))
    });
  });
};
