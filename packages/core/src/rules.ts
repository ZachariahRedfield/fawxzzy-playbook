export type RuleContext = {
  repoRoot: string;
  changedFiles: string[];
};

export type RuleFailure = {
  id: string;
  message: string;
  evidence?: string;
  fix?: string;
};

export type RuleResult = {
  failures: RuleFailure[];
};

export type FixResult = {
  filesChanged: string[];
  summary: string;
};

export type PlanTask = {
  ruleId: string;
  file: string | null;
  action: string;
  autoFix: boolean;
};

export type Task = PlanTask;

export interface Rule {
  id: string;
  description: string;
  check(context: RuleContext): RuleResult;
}

export type FixHandler = (context: { repoRoot: string; dryRun: boolean }) => Promise<FixResult>;
