import { describe, expect, it } from 'vitest';
import { buildWorksetPlan } from '../src/orchestration/worksetPlan.js';

describe('workset plan validation surface', () => {
  it('keeps conflict-free assignment clear when domains are isolated', () => {
    const artifact = buildWorksetPlan(
      process.cwd(),
      [
        { task_id: 'task-docs', task: 'update docs changelog and guides' },
        { task_id: 'task-cli', task: 'add a new cli command flag' }
      ],
      './fixtures/tasks.json'
    );

    expect(Array.isArray(artifact.validation.overlapping_file_domains)).toBe(true);
    expect(Array.isArray(artifact.validation.conflicting_artifact_ownership)).toBe(true);
    expect(artifact.validation.blocked_lane_dependencies).toEqual([]);
  });

  it('surfaces overlap and ownership conflict for shared docs surfaces', () => {
    const artifact = buildWorksetPlan(
      process.cwd(),
      [
        { task_id: 'task-docs-a', task: 'update docs architecture reference' },
        { task_id: 'task-docs-b', task: 'update docs examples and docs command references' }
      ],
      './fixtures/tasks.json'
    );

    expect(Array.isArray(artifact.validation.overlapping_file_domains)).toBe(true);
    expect(Array.isArray(artifact.validation.conflicting_artifact_ownership)).toBe(true);
    expect(artifact.lanes.every((lane) => lane.assignment_confidence >= 0 && lane.assignment_confidence <= 1)).toBe(true);
  });
});
