import type { Rule, RuleFailure } from './types.js';

export type RuleRunnerResult = {
  failures: RuleFailure[];
};

export class RuleRunner {
  constructor(private readonly rules: Rule[]) {}

  run(context: { repoRoot: string; changedFiles: string[] }): RuleRunnerResult {
    const failures = this.rules.flatMap((rule) =>
      rule.check({ repoRoot: context.repoRoot, changedFiles: context.changedFiles }).failures
    );

    return { failures };
  }
}
