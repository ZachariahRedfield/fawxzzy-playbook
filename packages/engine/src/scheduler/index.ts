export type SchedulerTaskState = 'pending' | 'completed';

export interface SchedulerTaskInput {
  taskId: string;
  priority: number;
  dependsOn?: string[];
  retryBudget?: number;
  attempts?: number;
  state?: SchedulerTaskState;
}

export interface SchedulerQueueItem {
  taskId: string;
  priority: number;
  dependsOn: string[];
  retryBudget: number;
  attempts: number;
  state: SchedulerTaskState;
}

export interface SchedulerClassification {
  ready: SchedulerQueueItem[];
  blocked: SchedulerQueueItem[];
  completed: SchedulerQueueItem[];
}

const DEFAULT_RETRY_BUDGET = 0;

const compareQueueItems = (left: SchedulerQueueItem, right: SchedulerQueueItem): number => {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  return left.taskId.localeCompare(right.taskId);
};

const cloneAndSort = (items: SchedulerQueueItem[]): SchedulerQueueItem[] =>
  [...items].sort(compareQueueItems);

export const createQueueItem = (task: SchedulerTaskInput): SchedulerQueueItem => ({
  taskId: task.taskId,
  priority: task.priority,
  dependsOn: [...(task.dependsOn ?? [])].sort((left, right) => left.localeCompare(right)),
  retryBudget: task.retryBudget ?? DEFAULT_RETRY_BUDGET,
  attempts: task.attempts ?? 0,
  state: task.state ?? 'pending'
});

export const hasRetryBudgetRemaining = (item: SchedulerQueueItem): boolean => item.attempts <= item.retryBudget;

export const areDependenciesCompleted = (item: SchedulerQueueItem, completedTaskIds: ReadonlySet<string>): boolean =>
  item.dependsOn.every((dependencyId) => completedTaskIds.has(dependencyId));

export const classifyQueueItems = (items: SchedulerQueueItem[]): SchedulerClassification => {
  const completedTaskIds = new Set(items.filter((item) => item.state === 'completed').map((item) => item.taskId));

  const ready: SchedulerQueueItem[] = [];
  const blocked: SchedulerQueueItem[] = [];
  const completed: SchedulerQueueItem[] = [];

  for (const item of items) {
    if (item.state === 'completed') {
      completed.push(item);
      continue;
    }

    if (!hasRetryBudgetRemaining(item) || !areDependenciesCompleted(item, completedTaskIds)) {
      blocked.push(item);
      continue;
    }

    ready.push(item);
  }

  return {
    ready: cloneAndSort(ready),
    blocked: cloneAndSort(blocked),
    completed: cloneAndSort(completed)
  };
};

export const selectNextTask = (items: SchedulerQueueItem[]): SchedulerQueueItem | null => {
  const { ready } = classifyQueueItems(items);
  return ready.at(0) ?? null;
};
