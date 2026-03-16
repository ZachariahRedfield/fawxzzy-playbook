import {
  applyAutoSafeImprovements,
  approveGovernanceImprovement,
  generateImprovementCandidates,
  writeImprovementCandidatesArtifact,
  type ImprovementCandidatesArtifact
} from '@zachariahredfield/playbook-engine';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
import { recordCommandQualitySignal } from '../../lib/commandQuality.js';

type ImproveOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

const renderText = (artifact: ImprovementCandidatesArtifact): void => {
  console.log('Improvement candidates');
  console.log('──────────────────────');
  console.log(`Generated at: ${artifact.generatedAt}`);
  console.log(`Thresholds: recurrence >= ${artifact.thresholds.minimum_recurrence}, confidence >= ${artifact.thresholds.minimum_confidence}`);
  console.log('');
  console.log('AUTO-SAFE');
  console.log(`- ${artifact.summary.AUTO_SAFE}`);
  console.log('CONVERSATIONAL');
  console.log(`- ${artifact.summary.CONVERSATIONAL}`);
  console.log('GOVERNANCE');
  console.log(`- ${artifact.summary.GOVERNANCE}`);
  console.log('');

  console.log('Doctrine lifecycle proposals (recommendation-first)');
  console.log(`- candidates: ${artifact.doctrine_candidates.candidates.length}`);
  console.log(`- transitions: ${artifact.doctrine_promotions.transitions.length}`);
  console.log('');

  console.log('Router recommendations (non-autonomous)');
  console.log(`- accepted: ${artifact.router_recommendations.recommendations.length}`);
  console.log(`- rejected: ${artifact.router_recommendations.rejected_recommendations.length}`);
  console.log('');

  if (artifact.candidates.length === 0) {
    console.log('No candidates met recurrence/confidence thresholds.');
    if (artifact.rejected_candidates.length > 0) {
      console.log(`Rejected candidates: ${artifact.rejected_candidates.length}`);
    }
  } else {
    for (const candidate of artifact.candidates) {
      console.log(`- [${candidate.gating_tier}] ${candidate.candidate_id} (${candidate.category})`);
      console.log(`  observation: ${candidate.observation}`);
      console.log(`  evidence: ${candidate.evidence_count} events across ${candidate.supporting_runs} runs, confidence: ${candidate.confidence_score}`);
      console.log(`  required review: ${candidate.required_review ? 'yes' : 'no'}`);
      console.log(`  why gated: ${candidate.blocking_reasons.length === 0 ? 'meets deterministic thresholds' : candidate.blocking_reasons.join(', ')}`);
      console.log(`  action: ${candidate.suggested_action}`);
    }
  }
};

const printConversationPrompts = (artifact: ImprovementCandidatesArtifact): void => {
  const conversational = artifact.candidates.filter((candidate: { improvement_tier: string }) => candidate.improvement_tier === 'conversation');

  for (const candidate of conversational) {
    console.log(`Approval needed (conversation): ${candidate.candidate_id}`);
    console.log(`- observation: ${candidate.observation}`);
    console.log(`- suggested action: ${candidate.suggested_action}`);
  }
};

export const runImprove = async (cwd: string, options: ImproveOptions): Promise<number> => {
  const startedAt = Date.now();
  const artifact = generateImprovementCandidates(cwd);
  writeImprovementCandidatesArtifact(cwd, artifact);

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'improve', payload: artifact });
  } else if (!options.quiet) {
    renderText(artifact);
    printConversationPrompts(artifact);
  }

  recordCommandQualitySignal({
    cwd,
    commandName: 'improve',
    runId: 'improve',
    inputsSummary: 'subcommand=default',
    artifactsWritten: ['.playbook/improvement-candidates.json'],
    successStatus: 'success',
    durationMs: Date.now() - startedAt,
    warningsCount: artifact.rejected_candidates.length,
    openQuestionsCount: artifact.rejected_candidates.length,
    confidenceScore: 0.8,
    downstreamArtifactsProduced: ['.playbook/improvement-candidates.json']
  });

  return ExitCode.Success;
};

export const runImproveApplySafe = async (cwd: string, options: ImproveOptions): Promise<number> => {
  const startedAt = Date.now();
  const artifact = applyAutoSafeImprovements(cwd);

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'improve-apply-safe', payload: artifact });
  } else if (!options.quiet) {
    console.log('Applied auto-safe improvements');
    console.log('────────────────────────────');
    console.log(`Applied: ${artifact.applied.length}`);
    console.log(`Pending conversational: ${artifact.pending_conversation.length}`);
    console.log(`Pending governance: ${artifact.pending_governance.length}`);
  }

  recordCommandQualitySignal({
    cwd,
    commandName: 'improve',
    runId: 'improve-apply-safe',
    inputsSummary: 'subcommand=apply-safe',
    successStatus: 'success',
    durationMs: Date.now() - startedAt,
    warningsCount: artifact.pending_conversation.length + artifact.pending_governance.length,
    openQuestionsCount: artifact.pending_governance.length,
    confidenceScore: 0.75
  });

  return ExitCode.Success;
};

export const runImproveApprove = async (cwd: string, proposalId: string | undefined, options: ImproveOptions): Promise<number> => {
  const startedAt = Date.now();
  if (!proposalId) {
    const message = 'playbook improve approve: missing <proposal_id>.';
    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'improve-approve', payload: { error: message } });
    } else {
      console.error(message);
    }
    recordCommandQualitySignal({
      cwd,
      commandName: 'improve',
      runId: 'improve-approve:missing',
      inputsSummary: 'subcommand=approve;proposal=<missing>',
      successStatus: 'failure',
      durationMs: Date.now() - startedAt,
      warningsCount: 1,
      openQuestionsCount: 1,
      confidenceScore: 0
    });
    return ExitCode.Failure;
  }

  try {
    const artifact = approveGovernanceImprovement(cwd, proposalId);
    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'improve-approve', payload: artifact });
    } else if (!options.quiet) {
      console.log(`Approved governance improvement: ${proposalId}`);
    }

    recordCommandQualitySignal({
      cwd,
      commandName: 'improve',
      runId: `improve-approve:${proposalId}`,
      inputsSummary: `subcommand=approve;proposal=${proposalId}`,
      successStatus: 'success',
      durationMs: Date.now() - startedAt,
      confidenceScore: 0.85
    });
    return ExitCode.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error while approving governance improvement.';
    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'improve-approve', payload: { error: message } });
    } else {
      console.error(message);
    }
    recordCommandQualitySignal({
      cwd,
      commandName: 'improve',
      runId: `improve-approve:${proposalId}`,
      inputsSummary: `subcommand=approve;proposal=${proposalId}`,
      successStatus: 'failure',
      durationMs: Date.now() - startedAt,
      warningsCount: 1,
      openQuestionsCount: 1,
      confidenceScore: 0.1
    });
    return ExitCode.Failure;
  }
};
