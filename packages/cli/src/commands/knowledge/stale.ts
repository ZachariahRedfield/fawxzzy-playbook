import { knowledgeStale } from '@zachariahredfield/playbook-engine';
import { parseIntegerOption, parseOrderOption, readOptionValue } from './shared.js';

export const runKnowledgeStale = (cwd: string, args: string[]) =>
  knowledgeStale(cwd, {
    limit: parseIntegerOption(readOptionValue(args, '--limit'), '--limit'),
    order: parseOrderOption(readOptionValue(args, '--order')),
    staleDays: parseIntegerOption(readOptionValue(args, '--days'), '--days')
  });
