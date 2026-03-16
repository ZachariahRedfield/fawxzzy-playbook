import path from 'node:path';
import { evaluateImprovementPolicy, POLICY_EVALUATION_RELATIVE_PATH, type PolicyEvaluationArtifact } from '@zachariahredfield/playbook-engine';
import { emitJsonOutput, writeJsonArtifactAbsolute } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
import { emitCommandFailure, printCommandHelp } from '../../lib/commandSurface.js';
import { createCommandQualityTracker } from '../../lib/commandQuality.js';
import { warn } from '../../lib/output.js';

type PolicyOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  help?: boolean;
};

const printPolicyHelp = (): void => {
  printCommandHelp({
    usage: 'playbook policy evaluate [options]',
    description: 'Evaluate improvement proposals with deterministic, governed runtime evidence. Read-only control-plane only.',
    options: [
      '--json                     Alias for --format=json',
      '--format <text|json>       Output format',
      '--quiet                    Suppress success output in text mode',
      '--help                     Show help'
    ],
    artifacts: ['.playbook/improvement-candidates.json (read)', '.playbook/cycle-history.json (read)']
  });
};

const renderText = (artifact: PolicyEvaluationArtifact): void => {
  console.log('Policy evaluation (read-only control-plane)');
  console.log('──────────────────────────────────────────');
  console.log(`Generated at: ${artifact.generatedAt}`);
  console.log(`Evaluations: ${artifact.summary.total}`);
  console.log(`safe: ${artifact.summary.safe}  requires_review: ${artifact.summary.requires_review}  blocked: ${artifact.summary.blocked}`);

  if (artifact.evaluations.length === 0) {
    console.log('No proposals found to evaluate.');
    return;
  }

  for (const evaluation of artifact.evaluations) {
    console.log(`- ${evaluation.proposal_id}: ${evaluation.decision}`);
    console.log(`  reason: ${evaluation.reason}`);
    console.log(`  evidence: frequency=${evaluation.evidence.frequency}, confidence=${evaluation.evidence.confidence}`);
  }
};

export const validatePolicyEvaluationArtifact = (artifact: PolicyEvaluationArtifact): string[] => {
  const errors: string[] = [];

  if (artifact.schemaVersion !== '1.0') {
    errors.push('schemaVersion must be "1.0"');
  }
  if (artifact.kind !== 'policy-evaluation') {
    errors.push('kind must be "policy-evaluation"');
  }
  if (!artifact.summary || typeof artifact.summary !== 'object') {
    errors.push('summary must be an object');
  } else {
    if (!Number.isInteger(artifact.summary.safe) || artifact.summary.safe < 0) {
      errors.push('summary.safe must be a non-negative integer');
    }
    if (!Number.isInteger(artifact.summary.requires_review) || artifact.summary.requires_review < 0) {
      errors.push('summary.requires_review must be a non-negative integer');
    }
    if (!Number.isInteger(artifact.summary.blocked) || artifact.summary.blocked < 0) {
      errors.push('summary.blocked must be a non-negative integer');
    }
    if (!Number.isInteger(artifact.summary.total) || artifact.summary.total < 0) {
      errors.push('summary.total must be a non-negative integer');
    }
  }

  if (!Array.isArray(artifact.evaluations)) {
    errors.push('evaluations must be an array');
  } else {
    for (const evaluation of artifact.evaluations) {
      if (typeof evaluation.proposal_id !== 'string' || evaluation.proposal_id.length === 0) {
        errors.push('evaluations[].proposal_id must be a non-empty string');
      }
      if (!['safe', 'requires_review', 'blocked'].includes(evaluation.decision)) {
        errors.push('evaluations[].decision must be one of safe, requires_review, blocked');
      }
      if (typeof evaluation.reason !== 'string' || evaluation.reason.length === 0) {
        errors.push('evaluations[].reason must be a non-empty string');
      }
      if (evaluation.evidence !== undefined && (typeof evaluation.evidence !== 'object' || evaluation.evidence === null || Array.isArray(evaluation.evidence))) {
        errors.push('evaluations[].evidence must be an object when present');
      }
    }

    const sortedProposalIds = [...artifact.evaluations]
      .map((entry: PolicyEvaluationArtifact['evaluations'][number]) => entry.proposal_id)
      .sort((left, right) => left.localeCompare(right));
    const currentProposalIds = artifact.evaluations.map((entry: PolicyEvaluationArtifact['evaluations'][number]) => entry.proposal_id);
    if (sortedProposalIds.join('\u0000') !== currentProposalIds.join('\u0000')) {
      errors.push('evaluations must be deterministically ordered by proposal_id');
    }
  }

  return errors;
};

export const runPolicy = async (cwd: string, args: string[], options: PolicyOptions): Promise<number> => {
  const tracker = createCommandQualityTracker(cwd, 'policy');

  if (options.help) {
    printPolicyHelp();
    tracker.finish({ inputsSummary: 'help=true', successStatus: 'success' });
    return ExitCode.Success;
  }

  const subcommand = args.find((arg) => !arg.startsWith('-'));
  if (subcommand !== 'evaluate') {
    const exitCode = emitCommandFailure('policy', options, {
      summary: 'Policy command failed: unsupported subcommand.',
      findingId: 'policy.subcommand.unsupported',
      message: 'Use `playbook policy evaluate`.',
      nextActions: ['Run `playbook policy evaluate --json` for deterministic policy output.']
    });
    tracker.finish({ inputsSummary: `subcommand=${subcommand ?? 'none'}`, successStatus: 'failure', warningsCount: 1 });
    return exitCode;
  }

  const artifact = evaluateImprovementPolicy(cwd);
  const validationErrors = validatePolicyEvaluationArtifact(artifact);
  if (validationErrors.length > 0) {
    warn(`playbook policy evaluate: warning: policy-evaluation artifact failed schema validation: ${validationErrors.join('; ')}`);
  }
  writeJsonArtifactAbsolute(path.join(cwd, POLICY_EVALUATION_RELATIVE_PATH), artifact as Record<string, unknown>, 'policy', { envelope: false });

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'policy', payload: artifact });
    tracker.finish({
      inputsSummary: 'subcommand=evaluate',
      artifactsRead: ['.playbook/improvement-candidates.json', '.playbook/cycle-history.json'],
      artifactsWritten: [POLICY_EVALUATION_RELATIVE_PATH],
      successStatus: 'success'
    });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    renderText(artifact);
  }

  tracker.finish({
    inputsSummary: 'subcommand=evaluate',
    artifactsRead: ['.playbook/improvement-candidates.json', '.playbook/cycle-history.json'],
    artifactsWritten: [POLICY_EVALUATION_RELATIVE_PATH],
    successStatus: 'success'
  });

  return ExitCode.Success;
};
