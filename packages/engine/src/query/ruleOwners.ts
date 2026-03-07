import { getRuleMetadata, listRuleMetadata } from '../explain/ruleRegistry.js';

export type RuleOwnershipEntry = {
  ruleId: string;
  area: string;
  owners: string[];
  remediationType: string;
};

export type RuleOwnersQueryResult =
  | {
      schemaVersion: '1.0';
      command: 'query';
      type: 'rule-owners';
      rules: RuleOwnershipEntry[];
    }
  | {
      schemaVersion: '1.0';
      command: 'query';
      type: 'rule-owners';
      rule: RuleOwnershipEntry;
    };

const toOwnershipEntry = (ruleId: string): RuleOwnershipEntry => {
  const metadata = getRuleMetadata(ruleId);
  if (!metadata) {
    throw new Error(`playbook query rule-owners: unknown rule \"${ruleId}\".`);
  }

  return {
    ruleId: metadata.id,
    area: metadata.ownership.area,
    owners: [...metadata.ownership.owners],
    remediationType: metadata.ownership.remediationType
  };
};

export const queryRuleOwners = (ruleId?: string): RuleOwnersQueryResult => {
  if (ruleId) {
    return {
      schemaVersion: '1.0',
      command: 'query',
      type: 'rule-owners',
      rule: toOwnershipEntry(ruleId)
    };
  }

  return {
    schemaVersion: '1.0',
    command: 'query',
    type: 'rule-owners',
    rules: listRuleMetadata().map((entry) => ({
      ruleId: entry.id,
      area: entry.ownership.area,
      owners: [...entry.ownership.owners],
      remediationType: entry.ownership.remediationType
    }))
  };
};
