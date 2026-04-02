import fs from 'node:fs';
import path from 'node:path';
import { WORKER_LAUNCH_PLAN_RELATIVE_PATH, type WorkerLaunchPlanArtifact } from '../orchestration/workerLaunchPlan.js';
import {
  computeLaunchPlanFingerprint,
  listOrchestrationExecutionRuns,
  type OrchestrationExecutionRunState
} from './orchestrationRunState.js';

export const EXECUTION_MERGE_GUARDS_RELATIVE_PATH = '.playbook/execution-merge-guards.json' as const;

type MergeGuardRunEvaluation = {
  run_id: string;
  mergeEligible: boolean;
  blockingReasons: string[];
  unresolvedReceipts: string[];
  protectedDocUnresolved: string[];
  failedOrBlockedLaneRefs: string[];
  pendingFollowups: string[];
  staleOrConflictedState: boolean;
};

export type ExecutionMergeGuardsArtifact = {
  schemaVersion: '1.0';
  kind: 'execution-merge-guards';
  generatedAt: string;
  sourceArtifacts: {
    workerLaunchPlanPath: string;
    executionRunsDir: string;
  };
  runs: MergeGuardRunEvaluation[];
};

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].filter(Boolean).sort((left, right) => left.localeCompare(right));

const readJsonIfPresent = <T>(repoRoot: string, relativePath: string): T | undefined => {
  const artifactPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(artifactPath)) return undefined;
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as T;
};

const writeArtifact = (repoRoot: string, artifact: ExecutionMergeGuardsArtifact): string => {
  const artifactPath = path.join(repoRoot, EXECUTION_MERGE_GUARDS_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifactPath;
};

const evaluateRun = (repoRoot: string, run: OrchestrationExecutionRunState, launchPlan: WorkerLaunchPlanArtifact): MergeGuardRunEvaluation => {
  const launchLanes = [...launchPlan.lanes].sort((left, right) => left.lane_id.localeCompare(right.lane_id));
  const launchEligibleLaneIds = launchLanes.filter((lane) => lane.launchEligible).map((lane) => lane.lane_id);
  const launchFingerprint = computeLaunchPlanFingerprint(launchPlan);

  const failedOrBlockedLaneRefs = uniqueSorted(
    Object.values(run.lanes)
      .filter((lane) => lane.status === 'failed' || lane.status === 'blocked')
      .map((lane) => `${lane.lane_id}:${lane.status}`)
  );

  const incompleteRequiredLaneRefs = uniqueSorted(
    launchEligibleLaneIds
      .filter((laneId) => {
        const status = run.lanes[laneId]?.status;
        return status !== 'completed';
      })
      .map((laneId) => `${laneId}:${run.lanes[laneId]?.status ?? 'missing'}`)
  );

  const protectedDocUnresolved = uniqueSorted(
    launchLanes
      .filter((lane) => lane.protectedSingletonImpact.unresolved)
      .map((lane) => `${lane.lane_id}:${lane.protectedSingletonImpact.consolidationStage}:${lane.protectedSingletonImpact.targets.join(',') || 'protected-doc-target'}`)
  );

  const unresolvedReceipts = uniqueSorted(
    launchLanes.flatMap((lane) =>
      lane.requiredReceipts
        .filter((receiptPath) => !fs.existsSync(path.join(repoRoot, receiptPath)))
        .map((receiptPath) => `${lane.lane_id}:${receiptPath}`)
    )
  );

  const pendingFollowups = uniqueSorted(
    launchLanes.flatMap((lane) => {
      const followups: string[] = [];
      if (lane.releaseReadyPreconditions.includes('required-receipts-recorded') && unresolvedReceipts.some((entry) => entry.startsWith(`${lane.lane_id}:`))) {
        followups.push(`${lane.lane_id}:required-receipts-recorded`);
      }
      if (
        lane.releaseReadyPreconditions.includes('protected-singleton-consolidation-resolved') &&
        lane.protectedSingletonImpact.unresolved
      ) {
        followups.push(`${lane.lane_id}:protected-singleton-consolidation-resolved`);
      }
      if (lane.releaseReadyPreconditions.includes('lane-readiness-and-dependencies-satisfied') && incompleteRequiredLaneRefs.some((entry) => entry.startsWith(`${lane.lane_id}:`))) {
        followups.push(`${lane.lane_id}:lane-readiness-and-dependencies-satisfied`);
      }
      return followups;
    })
  );

  const staleReasons: string[] = [];
  if (run.source_launch_plan_fingerprint !== launchFingerprint) {
    staleReasons.push('run-state-launch-plan-fingerprint-mismatch');
  }

  const runEligibleSorted = [...run.eligible_lanes].sort((left, right) => left.localeCompare(right));
  const launchEligibleSorted = [...launchEligibleLaneIds].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(runEligibleSorted) !== JSON.stringify(launchEligibleSorted)) {
    staleReasons.push('run-state-eligible-lane-set-mismatch');
  }

  const laneStatuses = Object.values(run.lanes).map((lane) => lane.status);
  const terminal = laneStatuses.every((status) => status === 'completed' || status === 'failed' || status === 'blocked');
  if (terminal && run.status === 'running') {
    staleReasons.push('run-state-status-stale-running-while-lanes-terminal');
  }
  if (!terminal && run.status !== 'running') {
    staleReasons.push('run-state-status-conflict-nonterminal-lanes');
  }

  const blockingReasons = uniqueSorted([
    ...staleReasons,
    ...incompleteRequiredLaneRefs.map((entry) => `required-lane-incomplete:${entry}`),
    ...failedOrBlockedLaneRefs.map((entry) => `lane-terminal-blocker:${entry}`),
    ...protectedDocUnresolved.map((entry) => `protected-doc-unresolved:${entry}`),
    ...unresolvedReceipts.map((entry) => `required-receipt-missing:${entry}`),
    ...pendingFollowups.map((entry) => `required-followup-pending:${entry}`)
  ]);

  return {
    run_id: run.run_id,
    mergeEligible: blockingReasons.length === 0,
    blockingReasons,
    unresolvedReceipts,
    protectedDocUnresolved,
    failedOrBlockedLaneRefs,
    pendingFollowups,
    staleOrConflictedState: staleReasons.length > 0
  };
};

export const evaluateExecutionMergeGuards = (repoRoot: string): ExecutionMergeGuardsArtifact => {
  const launchPlan = readJsonIfPresent<WorkerLaunchPlanArtifact>(repoRoot, WORKER_LAUNCH_PLAN_RELATIVE_PATH);
  const runs = listOrchestrationExecutionRuns(repoRoot);

  const evaluations =
    launchPlan && launchPlan.kind === 'worker-launch-plan'
      ? runs
          .map((run) => evaluateRun(repoRoot, run, launchPlan))
          .sort((left, right) => left.run_id.localeCompare(right.run_id))
      : [];

  const artifact: ExecutionMergeGuardsArtifact = {
    schemaVersion: '1.0',
    kind: 'execution-merge-guards',
    generatedAt: new Date(0).toISOString(),
    sourceArtifacts: {
      workerLaunchPlanPath: WORKER_LAUNCH_PLAN_RELATIVE_PATH,
      executionRunsDir: '.playbook/execution-runs'
    },
    runs: evaluations
  };

  writeArtifact(repoRoot, artifact);
  return artifact;
};

export const readExecutionMergeGuards = (repoRoot: string): ExecutionMergeGuardsArtifact | undefined =>
  readJsonIfPresent<ExecutionMergeGuardsArtifact>(repoRoot, EXECUTION_MERGE_GUARDS_RELATIVE_PATH);

export const evaluateExecutionMergeGuardForRun = (repoRoot: string, runId: string): MergeGuardRunEvaluation | undefined => {
  const artifact = evaluateExecutionMergeGuards(repoRoot);
  return artifact.runs.find((entry) => entry.run_id === runId);
};
