import fs from 'node:fs';
import path from 'node:path';
import { deriveLaneState, type WorksetPlanArtifact } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../../lib/cliContract.js';

const WORKSET_PLAN_PATH = '.playbook/workset-plan.json';
const LANE_STATE_PATH = '.playbook/lane-state.json';

type LanesOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

const printText = (result: ReturnType<typeof deriveLaneState>): void => {
  console.log('Lane State');
  console.log('──────────');
  console.log(`Workset plan: ${result.workset_plan_path}`);
  console.log(`Blocked lanes: ${result.blocked_lanes.length}`);
  console.log(`Ready lanes: ${result.ready_lanes.length}`);
  console.log(`Merge-ready lanes: ${result.merge_readiness.merge_ready_lanes.length}`);

  if (result.blocked_lanes.length > 0) {
    console.log('');
    console.log('Blocked lane details:');
    for (const lane of result.lanes.filter((entry: (typeof result.lanes)[number]) => entry.status === 'blocked')) {
      console.log(`- ${lane.lane_id}: ${lane.blocked_reasons.join('; ') || 'blocked'}`);
    }
  }
};

export const runLanes = async (cwd: string, options: LanesOptions): Promise<number> => {
  const worksetPlanFile = path.join(cwd, WORKSET_PLAN_PATH);
  if (!fs.existsSync(worksetPlanFile)) {
    const message = `playbook lanes: missing workset plan at ${WORKSET_PLAN_PATH}. Run \"playbook orchestrate --tasks-file <path>\" first.`;
    if (options.format === 'json') {
      console.log(JSON.stringify({ schemaVersion: '1.0', command: 'lanes', error: message }, null, 2));
    } else {
      console.error(message);
    }
    return ExitCode.Failure;
  }

  const worksetPlan = JSON.parse(fs.readFileSync(worksetPlanFile, 'utf8')) as WorksetPlanArtifact;
  const laneState = deriveLaneState(worksetPlan, WORKSET_PLAN_PATH);

  fs.mkdirSync(path.join(cwd, '.playbook'), { recursive: true });
  fs.writeFileSync(path.join(cwd, LANE_STATE_PATH), `${JSON.stringify(laneState, null, 2)}\n`, 'utf8');

  if (options.format === 'json') {
    console.log(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          command: 'lanes',
          lane_state_path: LANE_STATE_PATH,
          lane_state: laneState
        },
        null,
        2
      )
    );
    return laneState.blocked_lanes.length > 0 ? ExitCode.Failure : ExitCode.Success;
  }

  if (!options.quiet) {
    printText(laneState);
  }

  return laneState.blocked_lanes.length > 0 ? ExitCode.Failure : ExitCode.Success;
};
