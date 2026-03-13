import { describe, expect, it } from 'vitest';
import { classifyQueueItems, createQueueItem, hasRetryBudgetRemaining, selectNextTask } from '../src/scheduler/index.js';

describe('scheduler primitives', () => {
  it('selects dependencies before dependent tasks', () => {
    const dependency = createQueueItem({ taskId: 'a-dependency', priority: 1, state: 'completed' });
    const dependent = createQueueItem({ taskId: 'b-dependent', priority: 10, dependsOn: ['a-dependency'] });

    const nextTask = selectNextTask([dependent, dependency]);

    expect(nextTask?.taskId).toBe('b-dependent');
  });

  it('breaks priority ties deterministically by task id', () => {
    const alpha = createQueueItem({ taskId: 'alpha', priority: 5 });
    const beta = createQueueItem({ taskId: 'beta', priority: 5 });

    const firstTask = selectNextTask([beta, alpha]);

    expect(firstTask?.taskId).toBe('alpha');
  });

  it('blocks tasks when retry budget is exhausted', () => {
    const exhausted = createQueueItem({ taskId: 'retry-exhausted', priority: 9, retryBudget: 1, attempts: 2 });

    expect(hasRetryBudgetRemaining(exhausted)).toBe(false);
    expect(selectNextTask([exhausted])).toBeNull();
  });

  it('classifies blocked and ready tasks based on dependencies', () => {
    const completed = createQueueItem({ taskId: 'setup', priority: 1, state: 'completed' });
    const ready = createQueueItem({ taskId: 'execute', priority: 7, dependsOn: ['setup'] });
    const blocked = createQueueItem({ taskId: 'finalize', priority: 8, dependsOn: ['missing-task'] });

    const classification = classifyQueueItems([blocked, ready, completed]);

    expect(classification.completed.map((item) => item.taskId)).toEqual(['setup']);
    expect(classification.ready.map((item) => item.taskId)).toEqual(['execute']);
    expect(classification.blocked.map((item) => item.taskId)).toEqual(['finalize']);
    expect(selectNextTask([blocked, ready, completed])?.taskId).toBe('execute');
  });
});
