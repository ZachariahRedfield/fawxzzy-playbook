import type { ReconciledRepoState, FleetUpdatedAdoptionState } from './executionUpdatedState.js';
import type { FleetAdoptionWorkQueue, AdoptionGroupedActionLane, AdoptionWorkItem, AdoptionWorkWave, WorkQueueParallelGroup } from './workQueue.js';
import type { RepoAdoptionBlocker } from './readiness.js';

const PRIORITY_ORDER: Record<ReconciledRepoState['reconciliation_status'], number> = {
  failed: 0,
  partial: 1,
  not_run: 2,
  stale_plan_or_superseded: 3,
  blocked: 4,
  completed_with_drift: 5,
  completed_as_planned: 6
};

const GROUP_ORDER: Record<WorkQueueParallelGroup, number> = {
  'connect lane': 0,
  'init lane': 1,
  'index lane': 2,
  'verify/plan lane': 3,
  'apply lane': 4,
  'retry lane': 5,
  'replan lane': 6
};

const NEXT_ACTION_ORDER = {
  retry: 0,
  replan: 1
} as const;

const WAVE_ORDER = {
  wave_1: 0,
  wave_2: 1
} as const;

const sortStrings = (values: Iterable<string>): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const promptLaneSegment = (promptId: string): string | null => promptId.split(':')[1] ?? null;

const commandForRetry = (repo: ReconciledRepoState): string => {
  const laneSegment = repo.prompt_ids.map(promptLaneSegment).find((value): value is string => typeof value === 'string' && value.length > 0);
  if (laneSegment === 'verify/plan_lane') return 'pnpm playbook verify --json && pnpm playbook plan --json';
  if (laneSegment === 'index_lane') return 'pnpm playbook index --json';
  if (laneSegment === 'init_lane') return 'pnpm playbook init';
  if (laneSegment === 'connect_lane') return 'pnpm playbook observer repo add <path>';
  return 'pnpm playbook apply --json';
};

const waveForRepo = (repo: ReconciledRepoState): 'wave_1' | 'wave_2' =>
  repo.prompt_ids.slice().sort((a, b) => a.localeCompare(b))[0]?.startsWith('wave_2:') ? 'wave_2' : 'wave_1';

const nextActionForRepo = (repo: ReconciledRepoState): 'retry' | 'replan' =>
  repo.reconciliation_status === 'stale_plan_or_superseded' ? 'replan' : 'retry';

const compareReposForNextQueue = (left: ReconciledRepoState, right: ReconciledRepoState): number => {
  const leftAction = nextActionForRepo(left);
  const rightAction = nextActionForRepo(right);
  return (
    PRIORITY_ORDER[left.reconciliation_status] - PRIORITY_ORDER[right.reconciliation_status] ||
    NEXT_ACTION_ORDER[leftAction] - NEXT_ACTION_ORDER[rightAction] ||
    WAVE_ORDER[waveForRepo(left)] - WAVE_ORDER[waveForRepo(right)] ||
    left.repo_id.localeCompare(right.repo_id)
  );
};

const compareDerivedQueueItems = (
  left: AdoptionWorkItem,
  right: AdoptionWorkItem,
  repoOrder: Map<string, number>
): number =>
  (repoOrder.get(left.repo_id) ?? Number.MAX_SAFE_INTEGER) - (repoOrder.get(right.repo_id) ?? Number.MAX_SAFE_INTEGER) ||
  NEXT_ACTION_ORDER[left.next_action ?? 'retry'] - NEXT_ACTION_ORDER[right.next_action ?? 'retry'] ||
  WAVE_ORDER[left.wave] - WAVE_ORDER[right.wave] ||
  GROUP_ORDER[left.parallel_group] - GROUP_ORDER[right.parallel_group] ||
  left.repo_id.localeCompare(right.repo_id) ||
  left.item_id.localeCompare(right.item_id);

const queueItemForRepo = (repo: ReconciledRepoState): AdoptionWorkItem | null => {
  if (repo.reconciliation_status === 'blocked' || repo.reconciliation_status === 'completed_as_planned' || repo.reconciliation_status === 'completed_with_drift') {
    return null;
  }

  const nextAction = nextActionForRepo(repo);
  const parallelGroup: WorkQueueParallelGroup = nextAction === 'replan' ? 'replan lane' : 'retry lane';
  const recommendedCommand = nextAction === 'replan' ? 'pnpm playbook verify --json && pnpm playbook plan --json' : commandForRetry(repo);
  return {
    item_id: `${repo.repo_id}:${nextAction}`,
    repo_id: repo.repo_id,
    lifecycle_stage: repo.updated_lifecycle_stage,
    blocker_codes: repo.blocker_codes.slice() as RepoAdoptionBlocker['code'][],
    recommended_command: recommendedCommand,
    priority_stage: repo.updated_lifecycle_stage === 'ready' ? 'ready' : 'apply_pending',
    severity: nextAction === 'replan' ? 'medium' : 'low',
    parallel_group: parallelGroup,
    dependencies: [],
    rationale: nextAction === 'replan'
      ? 'Updated state marked the prior plan stale or superseded, so the next adoption step is deterministic replanning.'
      : 'Updated state marked the prior execution outcome as retryable, so the next adoption step is a deterministic retry of the same command family.',
    wave: waveForRepo(repo),
    queue_source: 'updated_state',
    next_action: nextAction,
    prompt_lineage: sortStrings(repo.prompt_ids)
  };
};

export const deriveNextAdoptionQueueFromUpdatedState = (
  updatedState: FleetUpdatedAdoptionState,
  options?: { generatedAt?: string }
): FleetAdoptionWorkQueue => {
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const orderedRepos = [...updatedState.repos].sort(compareReposForNextQueue);
  const repoOrder = new Map(orderedRepos.map((repo, index) => [repo.repo_id, index]));
  const workItems = orderedRepos
    .map(queueItemForRepo)
    .filter((item): item is AdoptionWorkItem => item !== null)
    .sort((left, right) => compareDerivedQueueItems(left, right, repoOrder));

  const waves: AdoptionWorkWave[] = (['wave_1', 'wave_2'] as const).map((wave) => {
    const items = workItems.filter((item) => item.wave === wave);
    return {
      wave,
      item_ids: items.map((item) => item.item_id),
      repo_ids: sortStrings(items.map((item) => item.repo_id)),
      action_count: items.length
    };
  });

  const groupedMap = new Map<string, { parallel_group: WorkQueueParallelGroup; command: string; repo_ids: Set<string>; item_ids: Set<string> }>();
  for (const item of workItems) {
    const key = `${item.parallel_group}::${item.recommended_command}`;
    const current = groupedMap.get(key) ?? { parallel_group: item.parallel_group, command: item.recommended_command, repo_ids: new Set<string>(), item_ids: new Set<string>() };
    current.repo_ids.add(item.repo_id);
    current.item_ids.add(item.item_id);
    groupedMap.set(key, current);
  }
  const groupedActions: AdoptionGroupedActionLane[] = [...groupedMap.values()]
    .map((entry) => ({
      parallel_group: entry.parallel_group,
      command: entry.command,
      repo_ids: sortStrings(entry.repo_ids),
      item_ids: sortStrings(entry.item_ids)
    }))
    .sort((left, right) => GROUP_ORDER[left.parallel_group] - GROUP_ORDER[right.parallel_group] || left.command.localeCompare(right.command));

  return {
    schemaVersion: '1.0',
    kind: 'fleet-adoption-work-queue',
    generated_at: generatedAt,
    total_repos: updatedState.summary.repos_total,
    queue_source: 'updated_state',
    work_items: workItems,
    waves,
    grouped_actions: groupedActions,
    blocked_items: []
  };
};
