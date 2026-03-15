import {
  generateImprovementCandidates,
  writeImprovementCandidatesArtifact,
  type ImprovementCandidatesArtifact
} from '@zachariahredfield/playbook-engine';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';

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
  console.log('AUTO-SAFE improvements');
  console.log(`- ${artifact.summary.AUTO_SAFE}`);
  console.log('CONVERSATIONAL improvements');
  console.log(`- ${artifact.summary.CONVERSATIONAL}`);
  console.log('GOVERNANCE improvements');
  console.log(`- ${artifact.summary.GOVERNANCE}`);
  console.log('');

  if (artifact.candidates.length === 0) {
    console.log('No candidates met recurrence/confidence thresholds.');
    return;
  }

  for (const candidate of artifact.candidates) {
    console.log(`- [${candidate.improvement_tier}] ${candidate.candidate_id} (${candidate.category})`);
    console.log(`  observation: ${candidate.observation}`);
    console.log(`  recurrence: ${candidate.recurrence_count}, confidence: ${candidate.confidence}`);
    console.log(`  action: ${candidate.suggested_action}`);
  }
};

export const runImprove = async (cwd: string, options: ImproveOptions): Promise<number> => {
  const artifact = generateImprovementCandidates(cwd);
  writeImprovementCandidatesArtifact(cwd, artifact);

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'improve', payload: artifact });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    renderText(artifact);
  }

  return ExitCode.Success;
};
