import { generatePlanContract } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { buildPlanRemediation, deriveVerifyFailureFacts } from '../lib/remediationContract.js';

const renderTextPlan = (tasks: Array<{ ruleId: string; action: string }>): void => {
  console.log('Plan');
  console.log('────────');
  console.log('');
  console.log(`Tasks: ${tasks.length}`);
  console.log('');

  if (tasks.length === 0) {
    console.log('(none)');
    return;
  }

  for (const task of tasks) {
    const sentenceAction = task.action.charAt(0).toUpperCase() + task.action.slice(1);
    console.log(`${task.ruleId} ${sentenceAction}`);
  }
};

export const runPlan = async (
  cwd: string,
  options: { format: 'text' | 'json'; ci: boolean; quiet: boolean }
): Promise<number> => {
  const plan = generatePlanContract(cwd);
  const failureFacts = deriveVerifyFailureFacts(plan.verify);
  const failureCount = failureFacts.failureCount;
  const remediation = buildPlanRemediation({ findingCount: failureCount, stepCount: plan.tasks.length });

  if (process.env.PLAYBOOK_DEBUG_REMEDIATION === '1') {
    console.error(
      JSON.stringify(
        {
          command: 'plan',
          remediationDerivation: {
            failureCount,
            stepCount: plan.tasks.length,
            remediationStatus: remediation.status,
            verifyFailureSources: failureFacts.sources
          },
          verifyPayload: plan.verify
        },
        null,
        2
      )
    );
  }

  if (options.format === 'json') {
    console.log(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          command: 'plan',
          ok: true,
          exitCode: ExitCode.Success,
          verify: plan.verify,
          remediation,
          tasks: plan.tasks
        },
        null,
        2
      )
    );
    return ExitCode.Success;
  }

  if (!options.quiet) {
    renderTextPlan(plan.tasks);
  }

  return ExitCode.Success;
};
