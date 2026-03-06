import { generateExecutionPlan } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';

export const runPlan = async (
  cwd: string,
  options: { format: 'text' | 'json'; ci: boolean; quiet: boolean }
): Promise<number> => {
  const plan = generateExecutionPlan(cwd);

  if (options.format === 'json') {
    console.log(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          command: 'plan',
          ok: true,
          exitCode: ExitCode.Success,
          tasks: plan.tasks
        },
        null,
        2
      )
    );
    return ExitCode.Success;
  }

  if (!options.quiet) {
    console.log('Planned tasks:');
    if (plan.tasks.length === 0) {
      console.log('  (none)');
    } else {
      for (const task of plan.tasks) {
        console.log(`  - [${task.ruleId}] ${task.action}`);
        if (task.file) {
          console.log(`    file: ${task.file}`);
        }
      }
    }
  }

  return ExitCode.Success;
};
