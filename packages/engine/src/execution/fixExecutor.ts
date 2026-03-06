import type { FixHandler, Task } from './types.js';

export type AppliedFix = {
  taskId: string;
  ruleId: string;
  filesChanged: string[];
  summary: string;
};

export type SkippedFix = {
  taskId: string;
  ruleId: string;
  reason: string;
};

export type FixExecutionResult = {
  applied: AppliedFix[];
  skipped: SkippedFix[];
};

export class FixExecutor {
  constructor(private readonly handlers: Record<string, FixHandler | undefined>) {}

  async apply(tasks: Task[], options: { repoRoot: string; dryRun: boolean }): Promise<FixExecutionResult> {
    const applied: AppliedFix[] = [];
    const skipped: SkippedFix[] = [];

    for (const task of tasks) {
      const handler = this.handlers[task.ruleId];
      if (!handler) {
        skipped.push({
          taskId: task.id,
          ruleId: task.ruleId,
          reason: 'Not auto-fixable in playbook fix v1.'
        });
        continue;
      }

      const result = await handler({ repoRoot: options.repoRoot, dryRun: options.dryRun });
      applied.push({
        taskId: task.id,
        ruleId: task.ruleId,
        filesChanged: result.filesChanged,
        summary: result.summary
      });
    }

    return { applied, skipped };
  }
}
