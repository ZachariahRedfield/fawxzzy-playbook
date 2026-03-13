import { knowledgeProvenance } from '@zachariahredfield/playbook-engine';
import { parseIntegerOption, readOptionValue, resolveSubcommandArgument } from './shared.js';

export const runKnowledgeProvenance = (cwd: string, args: string[]) => {
  const id = resolveSubcommandArgument(args);
  if (!id) {
    throw new Error('playbook knowledge provenance: missing required <id> argument');
  }

  return knowledgeProvenance(cwd, id, {
    staleDays: parseIntegerOption(readOptionValue(args, '--days'), '--days')
  });
};
