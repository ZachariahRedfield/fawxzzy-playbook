import type { Rule } from '../execution/types.js';
import type { PlaybookConfig } from '../config/schema.js';

export type EngineRuleContext = {
  repoRoot: string;
  changedFiles: string[];
  config: PlaybookConfig;
};

export type RuleFactory = (context: { config: PlaybookConfig }) => Rule;
