import {
  applyAutoSafeImprovements,
  approveGovernanceImprovement,
  generateImprovementCandidates,
  writeImprovementCandidatesArtifact,
  type ImprovementCandidatesArtifact
} from '@zachariahredfield/playbook-engine';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
import { emitCommandFailure, printCommandHelp } from '../../lib/commandSurface.js';

type ImproveOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  help?: boolean;
};

const printImproveHelp = (): void => {
  printCommandHelp({
    usage: 'playbook improve [apply-safe|approve <proposal_id>] [options]',
    description: 'Generate, apply, and approve deterministic improvement proposals.',
    options: ['apply-safe                Apply auto-safe improvement proposals', 'approve <proposal_id>      Approve governance-gated proposal', '--json                     Alias for --format=json', '--format <text|json>       Output format', '--quiet                    Suppress success output in text mode', '--help                     Show help'],
    artifacts: ['.playbook/improvement-candidates.json (write/read)', '.playbook/improvement-approvals.json (write for approve)']
  });
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

  if (artifact.router_recommendations.recommendations.length > 0) {
    console.log('');
    console.log('Router recommendation details (proposal-only)');
    for (const recommendation of artifact.router_recommendations.recommendations) {
      console.log(`- [${recommendation.gating_tier}] ${recommendation.recommendation_id} (${recommendation.task_family})`);
      console.log(`  strategy: ${recommendation.current_strategy} -> ${recommendation.recommended_strategy}`);
      console.log(`  evidence: ${recommendation.evidence_count} events across ${recommendation.supporting_runs} runs, confidence: ${recommendation.confidence_score}`);
      console.log(`  rationale: ${recommendation.rationale}`);
    }
  }

  if (artifact.doctrine_promotions.transitions.length > 0) {
    console.log('');
    console.log('Doctrine transitions');
    for (const transition of artifact.doctrine_promotions.transitions) {
      console.log(`- ${transition.candidate_id}: ${transition.from_stage} -> ${transition.to_stage}`);
      console.log(`  governance gated: ${transition.governance_gated ? 'yes' : 'no'}, approved: ${transition.approved ? 'yes' : 'no'}`);
      console.log(`  rationale: ${transition.rationale}`);
    }
  }

  if (artifact.rejected_candidates.length > 0) {
    console.log('');
    console.log('Rejected (insufficient evidence / confidence)');
    for (const rejected of artifact.rejected_candidates) {
      console.log(`- ${rejected.candidate_id} (${rejected.category})`);
      console.log(`  evidence: ${rejected.evidence_count} events across ${rejected.supporting_runs} runs, confidence: ${rejected.confidence_score}`);
      console.log(`  why gated: ${rejected.blocking_reasons.join(', ')}`);
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
  if (options.help) {
    printImproveHelp();
    return ExitCode.Success;
  }

  const artifact = generateImprovementCandidates(cwd);
  writeImprovementCandidatesArtifact(cwd, artifact);

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'improve', payload: artifact });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    renderText(artifact);
    printConversationPrompts(artifact);
  }

  return ExitCode.Success;
};

export const runImproveApplySafe = async (cwd: string, options: ImproveOptions): Promise<number> => {
  if (options.help) {
    printImproveHelp();
    return ExitCode.Success;
  }

  const artifact = applyAutoSafeImprovements(cwd);

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'improve-apply-safe', payload: artifact });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    console.log('Applied auto-safe improvements');
    console.log('────────────────────────────');
    console.log(`Applied: ${artifact.applied.length}`);
    console.log(`Pending conversational: ${artifact.pending_conversation.length}`);
    console.log(`Pending governance: ${artifact.pending_governance.length}`);
  }

  return ExitCode.Success;
};

export const runImproveApprove = async (cwd: string, proposalId: string | undefined, options: ImproveOptions): Promise<number> => {
  if (options.help) {
    printImproveHelp();
    return ExitCode.Success;
  }

  if (!proposalId) {
    return emitCommandFailure('improve-approve', options, {
      summary: 'Improve approve failed: missing proposal id.',
      findingId: 'improve.approve.proposal-id.required',
      message: 'Missing required argument: <proposal_id>.',
      nextActions: ['Run `playbook improve approve <proposal_id>` with a deterministic proposal identifier.']
    });
  }

  try {
    const artifact = approveGovernanceImprovement(cwd, proposalId);
    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'improve-approve', payload: artifact });
      return ExitCode.Success;
    }

    if (!options.quiet) {
      console.log(`Approved governance improvement: ${proposalId}`);
    }
    return ExitCode.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error while approving governance improvement.';
    return emitCommandFailure('improve-approve', options, {
      summary: 'Improve approve failed: approval operation did not complete.',
      findingId: 'improve.approve.failed',
      message,
      nextActions: ['Validate proposal id exists in .playbook/improvement-candidates.json and retry.']
    });
  }
};
