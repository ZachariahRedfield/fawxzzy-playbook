export type RuleMetadata = {
  id: string;
  purpose: string;
  fix: string[];
  ownership: {
    area: string;
    owners: string[];
    remediationType: string;
  };
};

const RULE_REGISTRY: Record<string, RuleMetadata> = {
  PB001: {
    id: 'PB001',
    purpose: 'Ensure architecture documentation exists and stays aligned with implementation intent.',
    fix: ['Update docs/ARCHITECTURE.md with the current system shape and module boundaries.'],
    ownership: {
      area: 'documentation',
      owners: ['docs'],
      remediationType: 'docs-sync'
    }
  },
  'notes.missing': {
    id: 'notes.missing',
    purpose: 'Require a PLAYBOOK_NOTES file so governance intent can be reviewed deterministically.',
    fix: ['Create PLAYBOOK_NOTES.md with a short summary of governance and architecture decisions.'],
    ownership: {
      area: 'governance',
      owners: ['governance'],
      remediationType: 'notes-maintenance'
    }
  },
  'notes.empty': {
    id: 'notes.empty',
    purpose: 'Prevent empty governance notes files that provide no actionable context.',
    fix: ['Add meaningful notes to PLAYBOOK_NOTES.md describing rationale and intended repository direction.'],
    ownership: {
      area: 'governance',
      owners: ['governance'],
      remediationType: 'notes-maintenance'
    }
  },
  requireNotesOnChanges: {
    id: 'requireNotesOnChanges',
    purpose: 'Require governance notes updates when source changes introduce architectural or policy impact.',
    fix: ['Update PLAYBOOK_NOTES.md in the same change when governance-relevant source files are modified.'],
    ownership: {
      area: 'governance',
      owners: ['governance'],
      remediationType: 'notes-maintenance'
    }
  },
  'verify.rule.tests.required': {
    id: 'verify.rule.tests.required',
    purpose: 'Require tests for new CLI commands and verify-rule changes.',
    fix: ['Add or update tests covering new command behavior and verify rule assertions.'],
    ownership: {
      area: 'quality',
      owners: ['cli', 'testing'],
      remediationType: 'test-coverage'
    }
  }
};

const normalizeRuleId = (ruleId: string): string => {
  const exact = RULE_REGISTRY[ruleId];
  if (exact) {
    return ruleId;
  }

  const lower = ruleId.toLowerCase();
  const matched = Object.keys(RULE_REGISTRY).find((id) => id.toLowerCase() === lower);
  return matched ?? ruleId;
};

export const getRuleMetadata = (ruleId: string): RuleMetadata | undefined => RULE_REGISTRY[normalizeRuleId(ruleId)];

export const listRuleMetadata = (): RuleMetadata[] =>
  Object.values(RULE_REGISTRY).sort((left, right) => left.id.localeCompare(right.id));
