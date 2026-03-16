import path from 'node:path';
import type { CommandExecutionQualityArtifact, CommandExecutionQualityRecord } from '@zachariahredfield/playbook-core';
import type { CommandQualityEvent, RepositoryEvent } from '../memory/events.js';
import { readJsonIfExists, writeDeterministicJsonAtomic } from '../learning/io.js';
import {
  COMMAND_EXECUTION_QUALITY_RELATIVE_PATH,
  normalizeCommandExecutionQualityArtifact
} from '../telemetry/commandQuality.js';
import {
  summarizeCycleRegressions,
  summarizeCycleTelemetry,
  type CycleHistoryArtifact,
  type CycleRegressionSummary,
  type CycleStateArtifact,
  type CycleTelemetrySummary
} from '../telemetry/cycleSummary.js';

export const COMMAND_IMPROVEMENTS_SCHEMA_VERSION = '1.0' as const;
export const COMMAND_IMPROVEMENTS_RELATIVE_PATH = '.playbook/command-improvements.json' as const;

export type CommandImprovementIssueType =
  | 'high_failure_rate'
  | 'low_confidence'
  | 'high_warnings_or_open_questions'
  | 'high_latency_vs_peers'
  | 'repeated_partial_failures';

export type CommandImprovementProposal = {
  proposal_id: string;
  command_name: string;
  issue_type: CommandImprovementIssueType;
  evidence_count: number;
  supporting_runs: number;
  average_failure_rate: number;
  average_duration_ms: number;
  average_confidence_score: number;
  proposed_improvement: string;
  rationale: string;
  confidence_score: number;
  gating_tier: 'CONVERSATIONAL' | 'GOVERNANCE';
  blocking_reasons: string[];
};

export type RejectedCommandImprovementProposal = CommandImprovementProposal;

export type RuntimeHardeningProposalIssueType =
  | 'failed_step_concentration'
  | 'rising_orchestration_duration'
  | 'repeated_verify_stage_failures';

export type RuntimeHardeningProposal = {
  proposal_id: string;
  issue_type: RuntimeHardeningProposalIssueType;
  evidence_count: number;
  supporting_runs: number;
  proposed_improvement: string;
  rationale: string;
  confidence_score: number;
  gating_tier: 'CONVERSATIONAL' | 'GOVERNANCE';
  blocking_reasons: string[];
};

export type RuntimeHardeningOpenQuestion = {
  question_id: string;
  question: string;
  rationale: string;
};

export type CommandImprovementsArtifact = {
  schemaVersion: typeof COMMAND_IMPROVEMENTS_SCHEMA_VERSION;
  kind: 'command-improvements';
  generatedAt: string;
  proposalOnly: true;
  nonAutonomous: true;
  thresholds: {
    minimum_evidence_count: number;
    high_failure_rate_threshold: number;
    low_confidence_threshold: number;
    high_warning_open_question_rate_threshold: number;
    high_latency_peer_ratio_threshold: number;
    repeated_partial_failure_rate_threshold: number;
  };
  sourceArtifacts: {
    commandQualityPath: string;
    commandQualitySummariesPath: string[];
    memoryEventsPath: string;
    commandQualityAvailable: boolean;
    cycleHistoryPath: string;
    cycleStatePath: string;
    cycleTelemetrySummaryPath: string;
    cycleRegressionsPath: string;
    cycleTelemetrySummaryAvailable: boolean;
    cycleRegressionsAvailable: boolean;
    cycleHistoryAvailable: boolean;
    cycleStateAvailable: boolean;
  };
  runtime_hardening: {
    proposals: RuntimeHardeningProposal[];
    rejected_proposals: RuntimeHardeningProposal[];
    open_questions: RuntimeHardeningOpenQuestion[];
  };
  proposals: CommandImprovementProposal[];
  rejected_proposals: RejectedCommandImprovementProposal[];
};

type CommandQualitySummaryRecord = {
  command_name: string;
  total_runs: number;
  failure_runs: number;
  partial_runs: number;
  average_duration_ms: number;
  average_confidence_score: number;
  total_warnings: number;
  total_open_questions: number;
};

const MINIMUM_EVIDENCE_COUNT = 3;
const HIGH_FAILURE_RATE_THRESHOLD = 0.35;
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const HIGH_WARNING_OR_OPEN_QUESTION_RATE = 1.0;
const HIGH_LATENCY_PEER_RATIO_THRESHOLD = 1.6;
const REPEATED_PARTIAL_FAILURE_RATE_THRESHOLD = 0.3;
const RUNTIME_HARDENING_MINIMUM_EVIDENCE = 2;
const VERIFY_STEP_ID = 'verify';

const round4 = (value: number): number => Number(value.toFixed(4));
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const safeDivide = (value: number, total: number): number => (total <= 0 ? 0 : value / total);

const toSummaryRecord = (records: CommandExecutionQualityRecord[], commandName: string): CommandQualitySummaryRecord => {
  const totalRuns = records.length;
  const failureRuns = records.filter((record) => record.success_status === 'failure').length;
  const partialRuns = records.filter((record) => record.success_status === 'partial').length;
  const totalDuration = records.reduce((sum, record) => sum + record.duration_ms, 0);
  const totalConfidence = records.reduce((sum, record) => sum + record.confidence_score, 0);
  const totalWarnings = records.reduce((sum, record) => sum + record.warnings_count, 0);
  const totalOpenQuestions = records.reduce((sum, record) => sum + record.open_questions_count, 0);

  return {
    command_name: commandName,
    total_runs: totalRuns,
    failure_runs: failureRuns,
    partial_runs: partialRuns,
    average_duration_ms: totalRuns === 0 ? 0 : Math.round(totalDuration / totalRuns),
    average_confidence_score: totalRuns === 0 ? 0 : round4(totalConfidence / totalRuns),
    total_warnings: totalWarnings,
    total_open_questions: totalOpenQuestions
  };
};

const normalizeSummaryRecord = (value: Record<string, unknown>): CommandQualitySummaryRecord | null => {
  if (typeof value.command_name !== 'string' || value.command_name.trim().length === 0) return null;
  const totalRuns = typeof value.total_runs === 'number' ? Math.max(0, Math.trunc(value.total_runs)) : 0;
  return {
    command_name: value.command_name.trim(),
    total_runs: totalRuns,
    failure_runs: typeof value.failure_runs === 'number' ? Math.max(0, Math.trunc(value.failure_runs)) : 0,
    partial_runs: typeof value.partial_runs === 'number' ? Math.max(0, Math.trunc(value.partial_runs)) : 0,
    average_duration_ms: typeof value.average_duration_ms === 'number' ? Math.max(0, Math.round(value.average_duration_ms)) : 0,
    average_confidence_score:
      typeof value.average_confidence_score === 'number' ? round4(clamp01(value.average_confidence_score)) : 0,
    total_warnings: typeof value.total_warnings === 'number' ? Math.max(0, Math.trunc(value.total_warnings)) : 0,
    total_open_questions: typeof value.total_open_questions === 'number' ? Math.max(0, Math.trunc(value.total_open_questions)) : 0
  };
};

const readOptionalSummaryRecords = (repoRoot: string): CommandQualitySummaryRecord[] => {
  const candidates = [
    '.playbook/telemetry/command-quality-summary.json',
    '.playbook/telemetry/command-quality-summaries.json'
  ];

  const parsed = candidates.flatMap((relativePath) => {
    const value = readJsonIfExists<unknown>(path.join(repoRoot, relativePath));
    if (!value || typeof value !== 'object') return [];
    const objectValue = value as Record<string, unknown>;

    const rows =
      Array.isArray(objectValue.summaries) ? objectValue.summaries
        : Array.isArray(objectValue.records) ? objectValue.records
          : Array.isArray(objectValue.commands) ? objectValue.commands
            : [];

    return rows
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      .map((entry) => normalizeSummaryRecord(entry))
      .filter((entry): entry is CommandQualitySummaryRecord => entry !== null);
  });

  const byCommand = new Map<string, CommandQualitySummaryRecord>();
  for (const summary of parsed) {
    byCommand.set(summary.command_name, summary);
  }

  return [...byCommand.values()].sort((left, right) => left.command_name.localeCompare(right.command_name));
};

const buildBaseProposal = (input: {
  commandName: string;
  issueType: CommandImprovementIssueType;
  summary: CommandQualitySummaryRecord;
  evidenceCount: number;
  supportingRuns: number;
  proposedImprovement: string;
  rationale: string;
  confidenceScore: number;
  gatingTier: 'CONVERSATIONAL' | 'GOVERNANCE';
}): CommandImprovementProposal => ({
  proposal_id: `${input.issueType}_${input.commandName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`,
  command_name: input.commandName,
  issue_type: input.issueType,
  evidence_count: input.evidenceCount,
  supporting_runs: input.supportingRuns,
  average_failure_rate: round4(safeDivide(input.summary.failure_runs, input.summary.total_runs)),
  average_duration_ms: input.summary.average_duration_ms,
  average_confidence_score: input.summary.average_confidence_score,
  proposed_improvement: input.proposedImprovement,
  rationale: input.rationale,
  confidence_score: round4(clamp01(input.confidenceScore)),
  gating_tier: input.gatingTier,
  blocking_reasons: []
});

const addEvidenceGating = (proposal: CommandImprovementProposal): CommandImprovementProposal => {
  if (proposal.evidence_count >= MINIMUM_EVIDENCE_COUNT) return proposal;
  return {
    ...proposal,
    blocking_reasons: [`insufficient_evidence_count:${proposal.evidence_count}<${MINIMUM_EVIDENCE_COUNT}`]
  };
};

const compareProposal = (left: CommandImprovementProposal, right: CommandImprovementProposal): number =>
  left.proposal_id.localeCompare(right.proposal_id)
  || left.command_name.localeCompare(right.command_name)
  || left.issue_type.localeCompare(right.issue_type);

const compareRuntimeHardeningProposal = (left: RuntimeHardeningProposal, right: RuntimeHardeningProposal): number =>
  left.proposal_id.localeCompare(right.proposal_id)
  || left.issue_type.localeCompare(right.issue_type);

const readCycleTelemetryOutput = (repoRoot: string): Partial<CycleTelemetrySummary> | null => {
  const value = readJsonIfExists<unknown>(path.join(repoRoot, '.playbook/telemetry/cycle-summary.json'));
  if (!value || typeof value !== 'object') return null;
  return value as Partial<CycleTelemetrySummary>;
};

const readCycleRegressionOutput = (repoRoot: string): Partial<CycleRegressionSummary> | null => {
  const value = readJsonIfExists<unknown>(path.join(repoRoot, '.playbook/telemetry/cycle-regressions.json'));
  if (!value || typeof value !== 'object') return null;
  return value as Partial<CycleRegressionSummary>;
};

const addRuntimeEvidenceGating = (proposal: RuntimeHardeningProposal): RuntimeHardeningProposal => {
  if (proposal.evidence_count >= RUNTIME_HARDENING_MINIMUM_EVIDENCE) return proposal;
  return {
    ...proposal,
    blocking_reasons: [
      `insufficient_runtime_evidence_count:${proposal.evidence_count}<${RUNTIME_HARDENING_MINIMUM_EVIDENCE}`
    ]
  };
};

const getCommandQualityEvents = (events: RepositoryEvent[]): CommandQualityEvent[] =>
  events.filter((event): event is CommandQualityEvent => event.event_type === 'command_quality');

export const generateCommandImprovementProposals = (
  repoRoot: string,
  events: RepositoryEvent[]
): CommandImprovementsArtifact => {
  const cycleHistory = readJsonIfExists<CycleHistoryArtifact>(path.join(repoRoot, '.playbook/cycle-history.json'));
  const cycleState = readJsonIfExists<CycleStateArtifact>(path.join(repoRoot, '.playbook/cycle-state.json'));
  const cycleTelemetry = summarizeCycleTelemetry({ cycleHistory, cycleState });
  const cycleRegression = summarizeCycleRegressions({ cycleHistory });
  const cycleTelemetryOutput = readCycleTelemetryOutput(repoRoot);
  const cycleRegressionOutput = readCycleRegressionOutput(repoRoot);

  const commandQuality = normalizeCommandExecutionQualityArtifact(
    readJsonIfExists<CommandExecutionQualityArtifact>(path.join(repoRoot, COMMAND_EXECUTION_QUALITY_RELATIVE_PATH))
  );
  const summaryRecords = readOptionalSummaryRecords(repoRoot);
  const summaryByCommand = new Map(summaryRecords.map((record) => [record.command_name, record]));

  const recordsByCommand = new Map<string, CommandExecutionQualityRecord[]>();
  for (const record of commandQuality.records) {
    recordsByCommand.set(record.command_name, [...(recordsByCommand.get(record.command_name) ?? []), record]);
  }

  const memoryEventsByCommand = new Map<string, CommandQualityEvent[]>();
  for (const event of getCommandQualityEvents(events)) {
    memoryEventsByCommand.set(event.command_name, [...(memoryEventsByCommand.get(event.command_name) ?? []), event]);
  }

  const allCommands = [...new Set([...recordsByCommand.keys(), ...summaryByCommand.keys(), ...memoryEventsByCommand.keys()])]
    .sort((left, right) => left.localeCompare(right));

  const computedSummaries = allCommands.map((commandName) => ({
    commandName,
    summary: summaryByCommand.get(commandName) ?? toSummaryRecord(recordsByCommand.get(commandName) ?? [], commandName),
    records: recordsByCommand.get(commandName) ?? [],
    qualityEvents: memoryEventsByCommand.get(commandName) ?? []
  }));

  const peerAverageDuration = computedSummaries.length === 0
    ? 0
    : Math.round(computedSummaries.reduce((sum, entry) => sum + entry.summary.average_duration_ms, 0) / computedSummaries.length);

  const proposals: CommandImprovementProposal[] = [];
  const runtimeHardeningProposals: RuntimeHardeningProposal[] = [];
  const runtimeHardeningOpenQuestions: RuntimeHardeningOpenQuestion[] = [];

  for (const entry of computedSummaries) {
    const failureRate = safeDivide(entry.summary.failure_runs, entry.summary.total_runs);
    const partialRate = safeDivide(entry.summary.partial_runs, entry.summary.total_runs);
    const warningOpenQuestionRate = safeDivide(entry.summary.total_warnings + entry.summary.total_open_questions, entry.summary.total_runs);
    const supportingRuns = new Set([
      ...entry.records.map((record) => record.run_id),
      ...entry.qualityEvents.map((event) => event.run_id ?? `${event.command_name}:${event.timestamp}`)
    ]).size;
    const evidenceCount = Math.max(entry.summary.total_runs, entry.qualityEvents.length);

    if (failureRate >= HIGH_FAILURE_RATE_THRESHOLD) {
      proposals.push(addEvidenceGating(buildBaseProposal({
        commandName: entry.commandName,
        issueType: 'high_failure_rate',
        summary: entry.summary,
        evidenceCount,
        supportingRuns,
        proposedImprovement: 'add deterministic preflight checks and explicit failure diagnostics before command execution',
        rationale: `Failure rate is ${round4(failureRate)}, above deterministic threshold ${HIGH_FAILURE_RATE_THRESHOLD}.`,
        confidenceScore: clamp01(0.45 + failureRate * 0.45 + Math.min(0.1, evidenceCount * 0.01)),
        gatingTier: failureRate >= 0.5 ? 'GOVERNANCE' : 'CONVERSATIONAL'
      })));
    }

    if (entry.summary.average_confidence_score <= LOW_CONFIDENCE_THRESHOLD) {
      proposals.push(addEvidenceGating(buildBaseProposal({
        commandName: entry.commandName,
        issueType: 'low_confidence',
        summary: entry.summary,
        evidenceCount,
        supportingRuns,
        proposedImprovement: 'tighten command prompts/inputs and add explicit confidence-raising validation hints in command output',
        rationale: `Average confidence is ${entry.summary.average_confidence_score}, below threshold ${LOW_CONFIDENCE_THRESHOLD}.`,
        confidenceScore: clamp01(0.4 + (1 - entry.summary.average_confidence_score) * 0.45 + Math.min(0.1, evidenceCount * 0.01)),
        gatingTier: 'CONVERSATIONAL'
      })));
    }

    if (warningOpenQuestionRate >= HIGH_WARNING_OR_OPEN_QUESTION_RATE) {
      proposals.push(addEvidenceGating(buildBaseProposal({
        commandName: entry.commandName,
        issueType: 'high_warnings_or_open_questions',
        summary: entry.summary,
        evidenceCount,
        supportingRuns,
        proposedImprovement: 'reduce warning/open-question churn by adding deterministic remediation hints and clearer required inputs',
        rationale: `Warning/open-question rate is ${round4(warningOpenQuestionRate)} per run, above threshold ${HIGH_WARNING_OR_OPEN_QUESTION_RATE}.`,
        confidenceScore: clamp01(0.42 + Math.min(0.45, warningOpenQuestionRate * 0.25) + Math.min(0.1, evidenceCount * 0.01)),
        gatingTier: 'CONVERSATIONAL'
      })));
    }

    if (peerAverageDuration > 0 && entry.summary.average_duration_ms >= Math.round(peerAverageDuration * HIGH_LATENCY_PEER_RATIO_THRESHOLD)) {
      proposals.push(addEvidenceGating(buildBaseProposal({
        commandName: entry.commandName,
        issueType: 'high_latency_vs_peers',
        summary: entry.summary,
        evidenceCount,
        supportingRuns,
        proposedImprovement: 'profile command path and split high-cost operations into inspectable stages while preserving deterministic output contracts',
        rationale: `Average duration ${entry.summary.average_duration_ms}ms exceeds peer baseline ${peerAverageDuration}ms by ratio >= ${HIGH_LATENCY_PEER_RATIO_THRESHOLD}.`,
        confidenceScore: clamp01(0.43 + Math.min(0.4, safeDivide(entry.summary.average_duration_ms, Math.max(1, peerAverageDuration)) * 0.2) + Math.min(0.1, evidenceCount * 0.01)),
        gatingTier: 'CONVERSATIONAL'
      })));
    }

    if (entry.summary.partial_runs >= 2 && partialRate >= REPEATED_PARTIAL_FAILURE_RATE_THRESHOLD) {
      proposals.push(addEvidenceGating(buildBaseProposal({
        commandName: entry.commandName,
        issueType: 'repeated_partial_failures',
        summary: entry.summary,
        evidenceCount,
        supportingRuns,
        proposedImprovement: 'harden partial-failure branches with deterministic fallback steps and explicit blocker reporting',
        rationale: `Partial failure rate is ${round4(partialRate)} with ${entry.summary.partial_runs} partial runs; repeated partial outcomes indicate unstable completion surface.`,
        confidenceScore: clamp01(0.44 + partialRate * 0.4 + Math.min(0.1, evidenceCount * 0.01)),
        gatingTier: partialRate >= 0.5 ? 'GOVERNANCE' : 'CONVERSATIONAL'
      })));
    }
  }

  const cyclesFailed = cycleTelemetry.cycles_failed;
  const mostCommonFailedStep = cycleTelemetry.most_common_failed_step;
  if (mostCommonFailedStep && cyclesFailed >= RUNTIME_HARDENING_MINIMUM_EVIDENCE) {
    const failedStepCount = cycleTelemetry.failure_distribution[mostCommonFailedStep] ?? 0;
    runtimeHardeningProposals.push(addRuntimeEvidenceGating({
      proposal_id: `runtime_failed_step_concentration_${mostCommonFailedStep.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`,
      issue_type: 'failed_step_concentration',
      evidence_count: failedStepCount,
      supporting_runs: Math.min(failedStepCount, cycleTelemetry.cycles_total),
      proposed_improvement: `inspect repeated cycle failures at step \"${mostCommonFailedStep}\" and draft deterministic preflight checks before any automation changes`,
      rationale: `Cycle failure distribution shows ${failedStepCount}/${cyclesFailed} failures concentrated on ${mostCommonFailedStep}.`,
      confidence_score: round4(clamp01(0.5 + safeDivide(failedStepCount, Math.max(1, cyclesFailed)) * 0.4)),
      gating_tier: failedStepCount >= 3 ? 'GOVERNANCE' : 'CONVERSATIONAL',
      blocking_reasons: []
    }));
  }

  const durationRegressionReason = cycleRegression.regression_reasons.find((reason) => reason.startsWith('duration_increase:'));
  if (durationRegressionReason) {
    runtimeHardeningProposals.push(addRuntimeEvidenceGating({
      proposal_id: 'runtime_rising_orchestration_duration',
      issue_type: 'rising_orchestration_duration',
      evidence_count: cycleRegression.recent_summary.cycles_total,
      supporting_runs: cycleRegression.recent_summary.cycles_total,
      proposed_improvement: 'inspect rising cycle duration across recent windows and propose bounded stage-level profiling before runtime policy changes',
      rationale: `Cycle regression evidence indicates sustained duration increase (${durationRegressionReason}).`,
      confidence_score: round4(clamp01(0.55 + Math.min(0.35, safeDivide(cycleRegression.recent_summary.cycles_total, 10)))),
      gating_tier: 'GOVERNANCE',
      blocking_reasons: []
    }));
  }

  const verifyFailureCount = cycleTelemetry.failure_distribution[VERIFY_STEP_ID] ?? 0;
  if (verifyFailureCount >= RUNTIME_HARDENING_MINIMUM_EVIDENCE) {
    runtimeHardeningProposals.push(addRuntimeEvidenceGating({
      proposal_id: 'runtime_repeated_verify_stage_failures',
      issue_type: 'repeated_verify_stage_failures',
      evidence_count: verifyFailureCount,
      supporting_runs: Math.min(verifyFailureCount, cycleTelemetry.cycles_total),
      proposed_improvement: 'inspect repeated verify-stage failures and document deterministic guardrail checks before promoting autofix behavior',
      rationale: `Cycle telemetry reports ${verifyFailureCount} failed cycles at verify stage.`,
      confidence_score: round4(clamp01(0.52 + Math.min(0.38, safeDivide(verifyFailureCount, Math.max(1, cyclesFailed + 1))))),
      gating_tier: verifyFailureCount >= 3 ? 'GOVERNANCE' : 'CONVERSATIONAL',
      blocking_reasons: []
    }));
  }

  if (cycleTelemetry.cycles_total < RUNTIME_HARDENING_MINIMUM_EVIDENCE) {
    runtimeHardeningOpenQuestions.push({
      question_id: 'runtime-evidence-history-depth',
      question: 'Cycle history is sparse; should runtime hardening proposals remain observational until additional governed runs accumulate?',
      rationale: `Only ${cycleTelemetry.cycles_total} cycles are available, below evidence floor ${RUNTIME_HARDENING_MINIMUM_EVIDENCE}.`
    });
  }


  if (cycleTelemetryOutput === null || cycleRegressionOutput === null) {
    runtimeHardeningOpenQuestions.push({
      question_id: 'runtime-telemetry-artifact-coverage',
      question: 'Cycle telemetry/regression output artifacts are incomplete; should runtime hardening remain scoped to direct governed cycle artifacts only?',
      rationale: 'One or more optional telemetry artifacts (.playbook/telemetry/cycle-summary.json, .playbook/telemetry/cycle-regressions.json) were not available.'
    });
  }

  if (!cycleRegression.comparison_window.sufficient_history) {
    runtimeHardeningOpenQuestions.push({
      question_id: 'runtime-regression-window-coverage',
      question: 'Regression comparison windows are incomplete; should duration and concentration signals stay recommendation-only until sufficient history is available?',
      rationale: cycleRegression.regression_reasons[0] ?? 'Regression comparison requires additional cycle history.'
    });
  }

  return {
    schemaVersion: COMMAND_IMPROVEMENTS_SCHEMA_VERSION,
    kind: 'command-improvements',
    generatedAt: new Date().toISOString(),
    proposalOnly: true,
    nonAutonomous: true,
    thresholds: {
      minimum_evidence_count: MINIMUM_EVIDENCE_COUNT,
      high_failure_rate_threshold: HIGH_FAILURE_RATE_THRESHOLD,
      low_confidence_threshold: LOW_CONFIDENCE_THRESHOLD,
      high_warning_open_question_rate_threshold: HIGH_WARNING_OR_OPEN_QUESTION_RATE,
      high_latency_peer_ratio_threshold: HIGH_LATENCY_PEER_RATIO_THRESHOLD,
      repeated_partial_failure_rate_threshold: REPEATED_PARTIAL_FAILURE_RATE_THRESHOLD
    },
    sourceArtifacts: {
      commandQualityPath: COMMAND_EXECUTION_QUALITY_RELATIVE_PATH,
      commandQualitySummariesPath: [
        '.playbook/telemetry/command-quality-summary.json',
        '.playbook/telemetry/command-quality-summaries.json'
      ],
      memoryEventsPath: '.playbook/memory/events/*',
      commandQualityAvailable: commandQuality.records.length > 0,
      cycleHistoryPath: '.playbook/cycle-history.json',
      cycleStatePath: '.playbook/cycle-state.json',
      cycleTelemetrySummaryPath: '.playbook/telemetry/cycle-summary.json',
      cycleRegressionsPath: '.playbook/telemetry/cycle-regressions.json',
      cycleTelemetrySummaryAvailable: cycleTelemetryOutput !== null,
      cycleRegressionsAvailable: cycleRegressionOutput !== null,
      cycleHistoryAvailable: Array.isArray(cycleHistory?.cycles),
      cycleStateAvailable: Boolean(cycleState)
    },
    runtime_hardening: {
      proposals: runtimeHardeningProposals.filter((proposal) => proposal.blocking_reasons.length === 0).sort(compareRuntimeHardeningProposal),
      rejected_proposals: runtimeHardeningProposals.filter((proposal) => proposal.blocking_reasons.length > 0).sort(compareRuntimeHardeningProposal),
      open_questions: runtimeHardeningOpenQuestions.sort((left, right) => left.question_id.localeCompare(right.question_id))
    },
    proposals: proposals.filter((proposal) => proposal.blocking_reasons.length === 0).sort(compareProposal),
    rejected_proposals: proposals.filter((proposal) => proposal.blocking_reasons.length > 0).sort(compareProposal)
  };
};

export const writeCommandImprovementArtifact = (
  repoRoot: string,
  artifact: CommandImprovementsArtifact,
  artifactPath = COMMAND_IMPROVEMENTS_RELATIVE_PATH
): string => {
  const resolvedPath = path.resolve(repoRoot, artifactPath);
  writeDeterministicJsonAtomic(resolvedPath, artifact);
  return resolvedPath;
};
