import type { RuleFailure, Task } from './types.js';

export type Plan = {
  tasks: Task[];
};

export class PlanGenerator {
  generate(findings: RuleFailure[]): Plan {
    return {
      tasks: findings.map((finding, index) => ({
        id: `task-${index + 1}`,
        ruleId: finding.id,
        action: finding.fix ?? `Resolve ${finding.id}`,
        file: finding.evidence,
        fix: finding.fix
      }))
    };
  }
}
