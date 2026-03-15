import type { WorksetPlanArtifact, WorksetLane } from './worksetPlan.js';

export type LaneExecutionStatus = 'blocked' | 'ready' | 'running' | 'completed';

export type LaneStateEntry = {
  lane_id: string;
  task_ids: string[];
  status: LaneExecutionStatus;
  dependency_level: 'low' | 'medium' | 'high';
  dependencies_satisfied: boolean;
  blocked_reasons: string[];
  verification_summary: {
    status: 'pending' | 'blocked';
    required_checks: string[];
    optional_checks: string[];
    notes: string[];
  };
  merge_ready: boolean;
  worker_ready: boolean;
};

export type LaneStateArtifact = {
  schemaVersion: '1.0';
  kind: 'lane-state';
  generatedAt: string;
  proposalOnly: true;
  workset_plan_path: string;
  lanes: LaneStateEntry[];
  blocked_lanes: string[];
  ready_lanes: string[];
  running_lanes: string[];
  completed_lanes: string[];
  dependency_status: {
    total_edges: number;
    satisfied_edges: number;
    unsatisfied_edges: number;
  };
  merge_readiness: {
    merge_ready_lanes: string[];
    not_merge_ready_lanes: Array<{ lane_id: string; reasons: string[] }>;
  };
  verification_status: {
    status: 'pending' | 'blocked';
    lanes_pending_verification: string[];
    lanes_blocked_from_verification: string[];
  };
  warnings: string[];
};

const sortUnique = (values: readonly string[]): string[] => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const blockedTaskLaneId = (taskId: string): string => `blocked-${taskId}`;

const mapDependencyGates = (worksetPlan: WorksetPlanArtifact): Map<string, string[]> => {
  const incoming = new Map<string, string[]>();
  for (const lane of worksetPlan.lanes) {
    incoming.set(lane.lane_id, []);
  }

  for (const edge of worksetPlan.dependency_edges) {
    const existing = incoming.get(edge.to_lane_id) ?? [];
    incoming.set(edge.to_lane_id, sortUnique([...existing, edge.from_lane_id]));
  }

  return incoming;
};

const toLaneStateEntry = (
  lane: WorksetLane,
  blockedReasons: string[],
  dependenciesSatisfied: boolean,
  dependencyGates: string[]
): LaneStateEntry => {
  const reasons = sortUnique([
    ...blockedReasons,
    ...(dependenciesSatisfied ? [] : dependencyGates.map((gateLane) => `waiting on dependency lane ${gateLane}`))
  ]);

  const status: LaneExecutionStatus = reasons.length > 0 ? 'blocked' : 'ready';
  const verificationStatus = status === 'ready' ? 'pending' : 'blocked';
  const mergeReady = status === 'ready' && lane.worker_ready && lane.likely_conflict_surfaces.length === 0;

  const verificationNotes = [
    ...(lane.likely_conflict_surfaces.length > 0 ? ['shared-risk surfaces require explicit merge coordination before verification sign-off'] : []),
    ...(status === 'blocked' ? ['verification deferred because lane readiness is blocked'] : ['lane is ready for deterministic validation execution'])
  ];

  return {
    lane_id: lane.lane_id,
    task_ids: [...lane.task_ids].sort((left, right) => left.localeCompare(right)),
    status,
    dependency_level: lane.dependency_level,
    dependencies_satisfied: dependenciesSatisfied,
    blocked_reasons: reasons,
    verification_summary: {
      status: verificationStatus,
      required_checks: ['pnpm -r build', 'pnpm test'],
      optional_checks: ['pnpm playbook contracts --json', 'pnpm playbook docs audit --json'],
      notes: verificationNotes
    },
    merge_ready: mergeReady,
    worker_ready: lane.worker_ready
  };
};

export const deriveLaneState = (worksetPlan: WorksetPlanArtifact, worksetPlanPath: string): LaneStateArtifact => {
  const dependencyGates = mapDependencyGates(worksetPlan);
  const laneById = new Map(worksetPlan.lanes.map((lane) => [lane.lane_id, lane]));

  const sortedLaneIds = [...laneById.keys()].sort((left, right) => left.localeCompare(right));
  const laneEntries: LaneStateEntry[] = [];

  for (const laneId of sortedLaneIds) {
    const lane = laneById.get(laneId);
    if (!lane) continue;

    const dependencyIds = dependencyGates.get(laneId) ?? [];
    const dependenciesSatisfied = dependencyIds.every((dependencyId) => {
      const dependencyLane = laneById.get(dependencyId);
      return Boolean(dependencyLane?.worker_ready);
    });

    const blockedReasons: string[] = [];
    if (!lane.worker_ready) {
      blockedReasons.push('worker prerequisites are not satisfied');
    }

    laneEntries.push(toLaneStateEntry(lane, blockedReasons, dependenciesSatisfied, dependencyIds));
  }

  for (const blockedTask of [...worksetPlan.blocked_tasks].sort((left, right) => left.task_id.localeCompare(right.task_id))) {
    laneEntries.push({
      lane_id: blockedTaskLaneId(blockedTask.task_id),
      task_ids: [blockedTask.task_id],
      status: 'blocked',
      dependency_level: 'high',
      dependencies_satisfied: false,
      blocked_reasons: sortUnique([blockedTask.reason, ...blockedTask.warnings, ...blockedTask.missing_prerequisites]),
      verification_summary: {
        status: 'blocked',
        required_checks: [],
        optional_checks: [],
        notes: ['blocked task must be refined before lane execution or verification can begin']
      },
      merge_ready: false,
      worker_ready: false
    });
  }

  const orderedLanes = [...laneEntries].sort((left, right) => left.lane_id.localeCompare(right.lane_id));

  const blocked_lanes = orderedLanes.filter((lane) => lane.status === 'blocked').map((lane) => lane.lane_id);
  const ready_lanes = orderedLanes.filter((lane) => lane.status === 'ready').map((lane) => lane.lane_id);
  const running_lanes = orderedLanes.filter((lane) => lane.status === 'running').map((lane) => lane.lane_id);
  const completed_lanes = orderedLanes.filter((lane) => lane.status === 'completed').map((lane) => lane.lane_id);

  const totalEdges = worksetPlan.dependency_edges.length;
  const unsatisfiedEdges = worksetPlan.dependency_edges.filter((edge) => {
    const targetLane = orderedLanes.find((lane) => lane.lane_id === edge.to_lane_id);
    return !targetLane?.dependencies_satisfied;
  }).length;

  const notMergeReady = orderedLanes
    .filter((lane) => !lane.merge_ready)
    .map((lane) => ({
      lane_id: lane.lane_id,
      reasons: sortUnique([
        ...(lane.status === 'blocked' ? lane.blocked_reasons : []),
        ...(lane.status !== 'ready' ? ['lane is not in ready state'] : []),
        ...(lane.worker_ready ? [] : ['worker prerequisites are not satisfied']),
        ...(lane.verification_summary.notes.some((note) => note.includes('merge coordination'))
          ? ['shared-risk surfaces require merge coordination']
          : [])
      ])
    }))
    .sort((left, right) => left.lane_id.localeCompare(right.lane_id));

  const warnings = sortUnique([
    ...worksetPlan.warnings,
    ...(blocked_lanes.length > 0 ? ['one or more lanes remain blocked; autonomous execution must stay disabled'] : []),
    ...(ready_lanes.length === 0 ? ['no lanes are ready; refine blocked or dependency-gated work before execution'] : []),
    ...(notMergeReady.length > 0 ? ['merge readiness is conservative and only true for isolated ready lanes'] : [])
  ]);

  return {
    schemaVersion: '1.0',
    kind: 'lane-state',
    generatedAt: new Date(0).toISOString(),
    proposalOnly: true,
    workset_plan_path: worksetPlanPath,
    lanes: orderedLanes,
    blocked_lanes,
    ready_lanes,
    running_lanes,
    completed_lanes,
    dependency_status: {
      total_edges: totalEdges,
      satisfied_edges: totalEdges - unsatisfiedEdges,
      unsatisfied_edges: unsatisfiedEdges
    },
    merge_readiness: {
      merge_ready_lanes: orderedLanes.filter((lane) => lane.merge_ready).map((lane) => lane.lane_id),
      not_merge_ready_lanes: notMergeReady
    },
    verification_status: {
      status: blocked_lanes.length > 0 ? 'blocked' : 'pending',
      lanes_pending_verification: orderedLanes
        .filter((lane) => lane.verification_summary.status === 'pending')
        .map((lane) => lane.lane_id),
      lanes_blocked_from_verification: orderedLanes
        .filter((lane) => lane.verification_summary.status === 'blocked')
        .map((lane) => lane.lane_id)
    },
    warnings
  };
};
