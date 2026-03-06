import type { Rule } from '../execution/types.js';
import type { PlaybookConfig } from '../config/schema.js';
import { requireNotesFileWhenGovernanceExists } from '../verify/rules/requireNotesFileWhenGovernanceExists.js';
import { requireNotesOnChanges } from '../verify/rules/requireNotesOnChanges.js';
import { requireTestsForNewCommands } from '../verify/rules/requireTestsForNewCommands.js';

export const getCoreRules = (config: PlaybookConfig): Rule[] => [
  {
    id: 'requireNotesFileWhenGovernanceExists',
    description: 'Require notes file whenever governance document exists.',
    check: ({ repoRoot }) => ({ failures: requireNotesFileWhenGovernanceExists(repoRoot) })
  },
  {
    id: 'requireNotesOnChanges',
    description: 'Require PLAYBOOK_NOTES updates when source changes occur.',
    check: ({ changedFiles }) => ({
      failures: requireNotesOnChanges(changedFiles, config.verify.rules.requireNotesOnChanges)
    })
  },
  {
    id: 'verify.rule.tests.required',
    description: 'Require tests for newly added CLI commands.',
    check: ({ repoRoot, changedFiles }) => ({ failures: requireTestsForNewCommands(repoRoot, changedFiles) })
  }
];
