import { knowledgeQuery } from '@zachariahredfield/playbook-engine';
import { parseKnowledgeFilters } from './shared.js';

export const runKnowledgeQuery = (cwd: string, args: string[]) => knowledgeQuery(cwd, parseKnowledgeFilters(args));
